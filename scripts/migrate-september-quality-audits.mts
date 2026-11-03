/**
 * migrate-september-quality-audits.mts
 *
 * Wrapper de compatibilidad hacia atrás para la migración de Septiembre 2026.
 * Invoca el migrador genérico `scripts/migrate-quality-audits.mts` con mes 9 y año 2026.
 */

import { execSync } from "child_process";

const args = process.argv.slice(2);
const forwardedArgs = ["--month", "9", "--year", "2026", ...args].join(" ");

try {
  execSync(`npx tsx scripts/migrate-quality-audits.mts ${forwardedArgs}`, {
    stdio: "inherit",
  });
} catch (err) {
  process.exit(1);
}
