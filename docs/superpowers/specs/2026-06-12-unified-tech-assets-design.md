# Visualización Unificada de Activos Tecnológicos en Directorio de Oficinas

## Objetivo

Unificar la visualización de activos manuales (`office_assets`) y terminales sincronizadas (`terminals`) en una única tabla dentro de la sección "Activos tecnológicos" del detalle desplegable de cada oficina en el Directorio de Oficinas. El usuario no debe percibir diferencia estructural entre ambas fuentes de datos.

## Contexto

- **Tabla `office_assets`**: Activos ingresados manualmente (servidores, impresoras, desktops, clientes). Se relacionan con la oficina por `officeId` (FK a `offices.id`).
- **Tabla `terminals`**: Terminales sincronizadas automáticamente desde el inventario de red. Se relacionan con la oficina por `nis` (FK a `offices.code`).
- La relación `terminals: many(terminals)` ya existe en `officesRelations` del schema.
- No se duplican ni transfieren registros entre tablas.

## Decisiones de diseño

### 1. Presentación: Tabla unificada (no subsecciones separadas)

Los registros de ambas tablas se renderizan como filas en una **única tabla** bajo el título "Activos tecnológicos". El usuario ve un listado homogéneo. La única distinción visible es un **badge de sincronización** en cada fila proveniente de `terminals`.

### 2. Campos expuestos por fuente

| Campo | `office_assets` | `terminals` |
|-------|-----------------|-------------|
| Tipo/Ícono/Color | Según `asset.type` (mapeo existente en `officeHelpers.ts`) | Según `operatingSystem` (mapeo de `TerminalRow.astro`: `getTerminalColorClass`) |
| Hostname | `asset.hostname` | `terminal.hostname` |
| IP | `asset.ip` | `terminal.ipAddress` |
| Badge origen | Ninguno | Badge `badge-info badge-xs` con ícono de sincronización |

### 3. Mapeo visual por OS para terminales

Se reutiliza la lógica existente de `TerminalRow.astro` (`getTerminalColorClass`) que ya implementa:

- Ubuntu/Debian → Si es telegrafía: `success`, sino `error`
- Windows 10 → `sky-500`
- Windows 11 → `blue-500`
- Windows Server → `blue-900`
- Fallback Windows → `info`
- Fallback Linux → `success`
- Legacy → `warning`

Se extrae la función `getTerminalColorClass` y las utilidades de OS (`toOsFamily`, `OsFamily`) a un módulo compartido para que tanto `TerminalRow.astro` como `OfficeRow.astro` puedan consumirlo sin duplicación.

**Nota sobre `isTelegrafia`:** En `TerminalRow.astro`, este flag se calcula con un subquery que cruza `office_assets` con `offices.type = 'TELEGRAFIA'`. En el contexto de `OfficeRow.astro`, ya tenemos el `office.type` del padre, por lo que `isTelegrafia = office.type === "TELEGRAFIA"` se puede pasar directamente como parámetro a `getTerminalColorClass`.

### 4. Etiqueta de tipo para terminales

- Se deduce del `operatingSystem`: si contiene "Windows" → "Windows", si contiene Linux/Ubuntu/Debian → "Linux", sino → "Terminal".

### 5. Orden de renderizado

Dentro de la tabla unificada:
1. Primero las terminales (sincronizadas), ordenadas por hostname.
2. Después los assets manuales, ordenados por el mapeo `assetOrderByType` existente.

### 6. Conteo en fila maestra

La fila maestra muestra un conteo unificado: `assets.length + terminals.length` como `"N activos"`.

### 7. Condición de desplegable

El botón desplegable se activa si:
```
office.contacts.length > 0 || office.assets.length > 0 || office.terminals.length > 0
```

### 8. Solo lectura para terminales

Las terminales no tienen controles de edición/eliminación. El badge de sincronización denota su origen automatizado.

## Cambios necesarios por archivo

### Capa de datos

#### `src/types/offices.ts`
- Agregar interfaz `OfficeTerminal` con: `hostname: string`, `ipAddress: string`, `operatingSystem: string`.
- Agregar campo `terminals: OfficeTerminal[]` a `OfficeDirectoryItem`.

#### `src/lib/officeQueries.ts`
- Agregar `terminals: true` al `with` de la query `db.query.offices.findMany()`.
- Mapear los terminales al nuevo tipo `OfficeTerminal` en la función de transformación.

#### `src/lib/terminalHelpers.ts` (NUEVO)
- Extraer `toOsFamily`, `OsFamily`, y `getTerminalColorClass` desde `TerminalRow.astro` y `terminalQueries.ts`.
- Agregar `getTerminalLabel(os: string): string` para deducir etiqueta.
- Exportar todo desde este módulo compartido.

### Capa de presentación

#### `src/components/offices/OfficeRow.astro`
- Importar `getTerminalColorClass`, `toOsFamily`, `getTerminalLabel` desde `@lib/terminalHelpers`.
- Actualizar `hasDetails` para incluir `office.terminals.length > 0`.
- Actualizar conteo de activos a `office.assets.length + office.terminals.length`.
- En la tabla de activos: renderizar primero las filas de terminales (con badge de sync e ícono por OS), luego las filas de assets manuales (sin cambios).

### Refactoring de `TerminalRow.astro`
- Actualizar imports para usar las funciones extraídas desde `@lib/terminalHelpers` en lugar de definirlas inline.

## Restricciones

- TypeScript estricto en todos los archivos modificados.
- Clases de Tailwind CSS y DaisyUI. Sin colores hardcodeados fuera de los ya existentes en `getTerminalColorClass`.
- Sin cambios en el schema de base de datos.
- Sin duplicación de lógica entre `TerminalRow.astro` y `OfficeRow.astro`.
