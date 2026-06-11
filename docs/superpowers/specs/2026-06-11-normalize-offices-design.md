# Design Specification: Office Names UTF-8 Normalization Script

Normalize the office names in the SQLite database to resolve encoding artifacts (Mojibake) caused by double-encoding or incorrect character-set parsing during data ingestion.

## User Review Required

> [!IMPORTANT]
> - **Execution Mode**: The script will load all records from the `offices` table, determine if normalization is needed using an application-level helper, perform updates sequentially, and output a detailed audit trail of changed records to the console.
> - **Safety / Dry-Run**: A dry-run argument (`--dry-run`) will be supported to preview changes without modifying the database.

## Proposed Changes

### Database Scripts Component

#### [NEW] [normalize-offices.ts](file:///s:/Dev/%21Proyectos/correo-argentino-mda/scripts/normalize-offices.ts)
This script will:
1. Import `db` from `@/db` (from `src/db/index.ts`).
2. Query all records from the `offices` table containing names with encoding anomalies.
3. Process each name using a dictionary of Unicode/UTF-8 Mojibake representations:
   - `\u00C3\u00A1` -> `á`
   - `\u00C3\u00A9` -> `é`
   - `\u00C3\u00AD` -> `í`
   - `\u00C3\u00B3` -> `ó`
   - `\u00C3\u00BA` -> `ú`
   - `\u00C3\u00B1` -> `ñ`
   - `\u00C3\u0081` -> `Á`
   - `\u00C3\u0089` -> `É`
   - `\u00C3\u008D` -> `Í`
   - `\u00C3\u0093` -> `Ó`
   - `\u00C3\u009A` -> `Ú`
   - `\u00C3\u0091` -> `Ñ`
4. If a name changes after normalization:
   - Log the change: `[ID: <id>] "<old_name>" -> "<new_name>"`
   - If not in dry-run mode, update the record in the database using Drizzle ORM.
5. Print a summary: Total records processed, total updated, and total skipped.

## Verification Plan

### Manual Verification
- Run the script in dry-run mode:
  ```bash
  npx tsx scripts/normalize-offices.ts --dry-run
  ```
- Review the logged output to ensure all proposed replacements are correct and no unwanted side effects occur.
- Run the script in write mode:
  ```bash
  npx tsx scripts/normalize-offices.ts
  ```
- Run the dry-run command again to ensure it logs 0 records to change (idempotency check).
