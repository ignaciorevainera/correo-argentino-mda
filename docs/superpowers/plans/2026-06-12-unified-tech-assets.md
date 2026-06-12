# Visualización Unificada de Activos Tecnológicos — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar la visualización de activos manuales (`office_assets`) y terminales sincronizadas (`terminals`) en una tabla única dentro de la sección "Activos tecnológicos" del Directorio de Oficinas.

**Architecture:** Se extrae la lógica visual de OS/color de `TerminalRow.astro` a un módulo compartido `terminalHelpers.ts`. Se extiende el tipo `OfficeDirectoryItem` con `terminals[]`. Se modifica la query Drizzle para incluir ambas relaciones. Se actualiza `OfficeRow.astro` para renderizar la tabla unificada.

**Tech Stack:** Astro v5, TypeScript, Drizzle ORM, Tailwind CSS, DaisyUI, astro-icon (Boxicons)

---

### Task 1: Extraer helpers de terminales a módulo compartido

**Files:**

- Create: `src/lib/terminalHelpers.ts`
- Modify: `src/components/inventario/TerminalRow.astro:1-60`
- Modify: `src/lib/terminalQueries.ts:6,53-63`

- [ ] **Step 1: Crear `src/lib/terminalHelpers.ts`**

```typescript
// src/lib/terminalHelpers.ts

export type OsFamily = "windows" | "linux" | "legacy";

export const toOsFamily = (osName: string): OsFamily => {
  const normalized = osName.toLowerCase();
  if (
    normalized.includes("ubuntu") ||
    normalized.includes("linux") ||
    normalized.includes("debian")
  )
    return "linux";
  if (normalized.includes("windows")) return "windows";
  return "legacy";
};

export const getTerminalColorClass = (
  osName: string,
  isTelegrafia: boolean,
): string => {
  const osLower = osName.toLowerCase();

  if (osLower.includes("ubuntu") || osLower.includes("debian")) {
    if (isTelegrafia) {
      return "border-success/30 bg-success/15 text-success";
    }
    return "border-error/30 bg-error/15 text-error";
  }

  if (osLower.includes("windows 10")) {
    return "border-sky-500/30 bg-sky-500/15 text-sky-500 dark:text-sky-400";
  }

  if (osLower.includes("windows 11")) {
    return "border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-400";
  }

  if (osLower.includes("windows server")) {
    return "border-blue-900/30 bg-blue-900/15 text-blue-900 dark:text-blue-300";
  }

  const osFamily = toOsFamily(osName);
  const tones: Record<OsFamily, string> = {
    windows: "border-info/30 bg-info/15 text-info",
    linux: "border-success/30 bg-success/15 text-success",
    legacy: "border-warning/30 bg-warning/15 text-warning",
  };

  return tones[osFamily];
};

export const getTerminalTypeLabel = (osName: string): string => {
  const normalized = osName.toLowerCase();
  if (normalized.includes("windows")) return "Windows";
  if (
    normalized.includes("ubuntu") ||
    normalized.includes("linux") ||
    normalized.includes("debian")
  )
    return "Linux";
  return "Terminal";
};
```

- [ ] **Step 2: Actualizar `src/lib/terminalQueries.ts` para importar desde el módulo compartido**

Reemplazar las líneas 6 y 53-63 de `terminalQueries.ts`:

```diff
-export type OsFamily = "windows" | "linux" | "legacy";
+import { type OsFamily, toOsFamily } from "@lib/terminalHelpers";
+export type { OsFamily };
```

Y eliminar la función local `toOsFamily` (líneas 53-63) que ahora viene del import.

- [ ] **Step 3: Actualizar `src/components/inventario/TerminalRow.astro` para importar desde el módulo compartido**

Reemplazar las líneas 2-44 del frontmatter:

```diff
 import { Icon } from "astro-icon/components";
-import type { TerminalItem, OsFamily } from "@lib/terminalQueries";
+import type { TerminalItem } from "@lib/terminalQueries";
+import { getTerminalColorClass, type OsFamily } from "@lib/terminalHelpers";

 type BoxiconName = `boxicons:${string}`;
```

Y reemplazar la función `getTerminalColorClass` inline (líneas 15-44) por:

```typescript
const getRowColorClass = (item: TerminalItem): string => {
  return getTerminalColorClass(item.osName, item.isTelegrafia);
};
```

Luego actualizar las referencias de `getTerminalColorClass(terminal)` a `getRowColorClass(terminal)` en el template (línea 84).

Eliminar el mapeo `osFamilyLabel` (líneas 46-50) ya que sigue siendo local a `TerminalRow.astro` y no se necesita en el módulo compartido.

- [ ] **Step 4: Verificar que el inventario de terminales sigue funcionando**

Run: `npx astro build 2>&1 | head -50`
Expected: Build exitoso sin errores de TypeScript.

- [ ] **Step 5: Commit**

```bash
git add src/lib/terminalHelpers.ts src/lib/terminalQueries.ts src/components/inventario/TerminalRow.astro
git commit -m "refactor: extract terminal OS helpers to shared module"
```

---

### Task 2: Extender tipos y query de oficinas

**Files:**

- Modify: `src/types/offices.ts`
- Modify: `src/lib/officeQueries.ts:161-214`

- [ ] **Step 1: Agregar interfaz `OfficeTerminal` y campo `terminals` al tipo**

Editar `src/types/offices.ts`. Agregar después de la interfaz `OfficeAsset` (línea 15):

```typescript
export interface OfficeTerminal {
  hostname: string;
  ipAddress: string;
  operatingSystem: string;
}
```

Y agregar al final de `OfficeDirectoryItem` (antes del cierre en línea 36):

```diff
   contacts: OfficeContact[];
   assets: OfficeAsset[];
+  terminals: OfficeTerminal[];
 }
```

- [ ] **Step 2: Actualizar la query en `officeQueries.ts` para incluir `terminals: true`**

Editar `src/lib/officeQueries.ts`, línea 172-176. Agregar `terminals: true` al `with`:

```typescript
    with: {
      assets: true,
      terminals: true,
      contacts: { with: { contact: true } },
      province: { with: { region: true } },
    },
```

- [ ] **Step 3: Mapear terminales en la transformación de datos**

En la misma función, después de la línea 213 (mapeo de `assets`), agregar el mapeo de `terminals`:

```diff
       assets: office.assets.map((a) => ({
         type: a.type as OfficeAssetType,
         hostname: a.hostname ?? "",
         ip: a.ip ?? "",
       })),
+      terminals: (office.terminals ?? []).map((t) => ({
+        hostname: t.hostname ?? "",
+        ipAddress: t.ipAddress ?? "",
+        operatingSystem: t.operatingSystem ?? "",
+      })),
     };
```

- [ ] **Step 4: Verificar build**

Run: `npx astro build 2>&1 | head -50`
Expected: Build exitoso. Es posible que `OfficeRow.astro` muestre un warning porque `terminals` aún no se usa en el template, pero no debería romper el build.

- [ ] **Step 5: Commit**

```bash
git add src/types/offices.ts src/lib/officeQueries.ts
git commit -m "feat: extend office query and types to include terminals"
```

---

### Task 3: Actualizar `OfficeRow.astro` para tabla unificada

**Files:**

- Modify: `src/components/offices/OfficeRow.astro`

- [ ] **Step 1: Agregar imports para helpers de terminal**

En el frontmatter de `OfficeRow.astro`, después de los imports existentes (línea 11), agregar:

```typescript
import {
  getTerminalColorClass,
  getTerminalTypeLabel,
} from "@lib/terminalHelpers";
```

- [ ] **Step 2: Actualizar `hasDetails` y conteo de activos**

Reemplazar la línea 28:

```diff
-const hasDetails = office.contacts.length > 0 || office.assets.length > 0;
+const totalAssets = office.assets.length + office.terminals.length;
+const hasDetails = office.contacts.length > 0 || totalAssets > 0;
```

- [ ] **Step 3: Actualizar el texto de conteo en la fila maestra**

Reemplazar la línea 114:

```diff
-          <span>{office.assets.length} activos</span>
+          <span>{totalAssets} activos</span>
```

- [ ] **Step 4: Actualizar la condición de renderizado de la sección de activos**

Reemplazar la línea 289:

```diff
-          office.assets.length > 0 ? (
+          totalAssets > 0 ? (
```

- [ ] **Step 5: Renderizar terminales antes de assets en la tabla unificada**

Dentro del `<tbody>` (entre las líneas 298-336), antes del bloque de assets manuales, agregar las filas de terminales. El `isTelegrafia` se deduce del tipo de la oficina:

```astro
{/* Terminales sincronizadas */}
{office.terminals
  .sort((a, b) => a.hostname.localeCompare(b.hostname))
  .map((terminal) => (
    <tr>
      <td>
        <div class="flex min-w-0 items-center gap-3">
          <span
            class:list={[
              "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border",
              getTerminalColorClass(
                terminal.operatingSystem,
                office.type === "TELEGRAFIA",
              ),
            ]}
            aria-hidden="true"
          >
            <Icon
              name="boxicons:desktop-filled"
              class="size-4"
            />
          </span>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-xs font-medium text-base-content/60">
                {getTerminalTypeLabel(terminal.operatingSystem)}
              </p>
              <span class="badge badge-info badge-xs gap-1">
                <Icon
                  name="boxicons:copy-check-filled
"
                  class="size-3"
                  aria-hidden="true"
                />
                Sync
              </span>
            </div>
            <p class="truncate font-mono text-sm font-semibold text-base-content">
              {terminal.hostname}
            </p>
          </div>
        </div>
      </td>
      <td class="font-mono text-sm">{terminal.ipAddress}</td>
    </tr>
  ))}
{/* Assets manuales (código existente sin cambios) */}
{[...office.assets]
  .sort(/* ... existing sort ... */)
  .map(/* ... existing map ... */)}
```

- [ ] **Step 6: Actualizar el mensaje vacío**

Reemplazar el texto del mensaje vacío (línea 341):

```diff
-              Sin activos tecnológicos registrados.
+              Sin activos tecnológicos registrados ni terminales detectadas.
```

- [ ] **Step 7: Verificar build**

Run: `npx astro build 2>&1 | head -50`
Expected: Build exitoso sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/components/offices/OfficeRow.astro
git commit -m "feat: render unified tech assets table with terminals and manual assets"
```

---

### Task 4: Verificación visual y funcional

**Files:**

- No files created or modified

- [ ] **Step 1: Verificar que la página carga correctamente**

Abrir `http://localhost:4321/directorio-oficinas` en el navegador. Verificar que la tabla se renderiza sin errores.

- [ ] **Step 2: Verificar el desplegable de una oficina con terminales**

Buscar una oficina que tenga terminales sincronizadas. Expandir el detalle y verificar:

- Las terminales aparecen primero en la tabla con ícono y color correcto por OS.
- Cada fila de terminal tiene el badge "Sync" azul.
- Los assets manuales aparecen después con su formato original.

- [ ] **Step 3: Verificar el conteo unificado**

En la fila maestra, verificar que el conteo de "N activos" incluye la suma de ambas fuentes.

- [ ] **Step 4: Verificar oficina sin activos ni terminales**

Buscar una oficina sin activos ni terminales. Verificar que el botón de desplegable no se muestra (o no tiene el affordance clickeable si solo tiene contactos).

- [ ] **Step 5: Verificar que el inventario de terminales no se rompió**

Navegar a `/inventario-terminales` y verificar que la tabla de terminales sigue funcionando correctamente con los imports actualizados.
