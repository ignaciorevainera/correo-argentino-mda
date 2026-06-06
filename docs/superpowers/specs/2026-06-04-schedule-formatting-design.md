# Design Spec: Schedule Time Formatting in Monthly Detail Modal

## Goal
Ensure the schedule input field (`#monthly-detail-schedule`) inside the monthly detail modal behaves identically to the real entry/exit and break inputs, auto-formatting inputs like `8-16` into `08:00 - 16:00` and `8` to `08:00`.

## Architecture
We will implement a helper function `formatScheduleInput` in `utils.ts` that:
1. Detects and preserves non-time strings like "Franco", "Vacaciones", "Licencia".
2. Splits ranges on `-` and formats both sides individually using `formatTimeInput`.
3. Formats single times using `formatTimeInput`.
4. Returns the formatted value.

This helper will be integrated on the `blur` event listeners in `MonthlyDetailModal.astro` and `weekly-schedule.ts`.

## Affected Files
1. [utils.ts](file:///C:/Users/daaltamirano1/Documents/correo-argentino-mda/src/components/cronograma/lib/utils.ts) - Define `formatScheduleInput`.
2. [MonthlyDetailModal.astro](file:///C:/Users/daaltamirano1/Documents/correo-argentino-mda/src/components/cronograma/subcomponents/MonthlyDetailModal.astro) - Integrate `formatScheduleInput` on schedule input blur and save events.
3. [weekly-schedule.ts](file:///C:/Users/daaltamirano1/Documents/correo-argentino-mda/src/components/cronograma/lib/weekly-schedule.ts) - Integrate `formatScheduleInput` for consistent formatting in weekly views.
