# Sincronización de inventario legacy de terminales

## Contexto

El portal MDA necesita sincronizar diariamente el inventario de terminales desde el sistema legacy accesible en `http://b1842zacs0255/mda/index.php`. El proceso extrae datos HTML, los parsea y los persiste en la tabla `terminals` de SQLite mediante Drizzle ORM.

## Decisiones tomadas

1. Agregar `.unique()` a `terminals.hostname` en el schema para soportar `onConflictDoUpdate`.
2. Agregar campo `syncedAt` (`text("synced_at")`) a la tabla `terminals` para trazabilidad de sincronización.
3. Instalar `cheerio` como dependencia directa del proyecto.
4. No excluir terminales cúbicas del procesamiento.
5. Abortar con código de error si el fetch falla (HTTP != 200, body vacío, error de red).
6. Script monolítico en `scripts/sync-legacy-inventory.ts` siguiendo el patrón de `ping-worker.ts`.
7. Ejecución manual con `npx tsx scripts/sync-legacy-inventory.ts`.

## Cambios al schema

### `src/db/schema.ts`

- `terminals.hostname`: agregar `.unique()`
- Nuevo campo: `syncedAt: text("synced_at")`

## Script: `scripts/sync-legacy-inventory.ts`

### Flujo

1. Log de inicio con timestamp.
2. `fetch()` a URL legacy con User-Agent de Chrome/Win64.
3. Validación: HTTP 200, body no vacío.
4. `cheerio.load()` del HTML.
5. Selector `#content > div table tbody tr` → iterar filas.
6. Para cada `tr`: extraer `td` por índice posicional → mapear a tipo `TerminalRecord`.
7. `.trim()` de cada valor, cadenas vacías → `null`.
8. Upsert con `onConflictDoUpdate` target `hostname`, actualizando campos técnicos + `syncedAt`.
9. Log del volumen procesado y finalización.

### Mapeo posicional

| Índice | Columna HTML   | Campo DB          |
|--------|----------------|-------------------|
| 0      | Hostname       | `hostname`        |
| 1      | Mac            | `macAddress`      |
| 2      | Ip-Dir         | `ipAddress`       |
| 3      | Sist. Ope.     | `operatingSystem` |
| 4      | OS. Tipo       | `osArchitecture`  |
| 5      | Ram            | `ram`             |
| 6      | Serial         | `serialNumber`    |
| 7      | manufacturer   | `manufacturer`    |
| 8      | Modelo         | `model`           |
| 9      | Sucursal       | Omitido           |
| 10     | Provincia      | Omitido           |
| 11     | Region         | Omitido           |
| 12     | NIS            | `nis`             |
| 13     | NIS2           | `nis2`            |
| 14     | Last-Contact   | `lastContact`     |

### Seguridad

- User-Agent emula Chrome 124 sobre Windows 10 de 64 bits.

### Tipo interno

```typescript
interface TerminalRecord {
  hostname: string;
  macAddress: string | null;
  ipAddress: string | null;
  operatingSystem: string | null;
  osArchitecture: string | null;
  ram: string | null;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  nis: string | null;
  nis2: string | null;
  lastContact: string | null;
}
```

### Manejo de errores

- Fetch: abortar con `process.exit(1)` si HTTP != 200 o body vacío.
- Parse: loguear filas sin hostname y saltearlas.
- DB: `try/catch` global con log de error y `process.exit(1)`.
