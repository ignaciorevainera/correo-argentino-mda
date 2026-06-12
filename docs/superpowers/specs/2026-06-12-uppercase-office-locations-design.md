# Spec: Uppercase Office Locations and Names Normalization

This specification outlines the design for updating the database normalization script to ensure all names, addresses, streets, localities, counties, and zones associated with offices are fully capitalized (uppercase) and have correct characters (mojibake-free).

## Goal

Correct casing issues (e.g. `PUESTO DE CORRECCIóN` -> `PUESTO DE CORRECCIÓN`) and ensure all location-related fields in the `offices` table are in uppercase.

## Target Fields in `offices` Table

1. `name` (string, required)
2. `address` (string, optional)
3. `street` (string, optional)
4. `locality` (string, optional)
5. `county` (string, optional)
6. `zone` (string, optional)

## Proposed Changes

### Script: [normalize-offices.ts](file:///s:/Dev/%21Proyectos/correo-argentino-mda/scripts/normalize-offices.ts)

- Update database select query to retrieve all 6 target fields.
- Introduce `normalizeField(id: number, val: string | null | undefined): string | null` which:
  - Returns `null` if the input is falsy.
  - Applies mojibake/character correction using `normalizeName(id, val)`.
  - Converts the corrected string to uppercase using `.toUpperCase()`.
- Compare current field values with normalized values. If any field differs, update the database row.
- Keep the existing test assertions inside `selfTest()` and extend them if necessary.
- Preserve `--dry-run` functionality.

## Verification Plan

### Manual Verification
- Execute `npx astro db execute scripts/normalize-offices.ts --dry-run` (or the equivalent run command) to verify changes before writing to the database.
- Inspect logs to confirm all targeted fields are correctly corrected and uppercased (e.g. `PUESTO DE CORRECCIóN` -> `PUESTO DE CORRECCIÓN`).
- Execute without `--dry-run` and verify database values.
