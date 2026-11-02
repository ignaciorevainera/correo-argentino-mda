# Specification: Métricas de Código (Líneas +/-) y Estimación de Horas en Changelog

## Overview
Incorporar en la página de `/changelog` y en el servicio lector (`changelogService.ts`) métricas visuales del esfuerzo técnico de cada release:
1. Contador al estilo GitHub de líneas de código agregadas (`+lines`) y eliminadas (`-lines`).
2. Indicador aproximado de horas de trabajo invertidas (`~X.X h`) en los commits de esa fecha.

Los cálculos se realizan en servidor de forma reactiva y protegida con cache en memoria, inspeccionando los commits listados en cada release sin requerir modificar ni ensuciar los archivos Markdown de `src/config/changelog/`.

## Functional Requirements

### 1. Cálculo de Líneas de Código (Numstat)
- Para cada release procesado en `getChangelogEntries()`, calcular el total de líneas agregadas (`additions`) y eliminadas (`deletions`) consultando los commits únicos listados en dicho release (`commits: [...]`).
- Ejecutar consulta git (`git show --numstat --format="" <hash>`) o agrupada por release.
- Excluir archivos binarios (`- - path`) y archivos generados o fixtures si aplicase.
- Manejar fallback seguro (`additions: 0, deletions: 0`) si git no está disponible o el hash no se resuelve en el entorno.

### 2. Estimación de Horas de Trabajo (Session Clustering)
- Obtener los timestamps unix de commit (`%ct`) de los commits del release y ordenarlos cronológicamente.
- Algoritmo de clustering de sesiones de trabajo estándar de git:
  - Base por commit inicial o commit aislado: 30 minutos (0.5 h).
  - Si la diferencia de tiempo entre commits sucesivos es `<= 2 horas (120 minutos)`, se considera parte de la misma sesión continua y se suma el tiempo real transcurrido (`delta_t`).
  - Si la diferencia es `> 2 horas`, se cierra la sesión anterior y se inicia una nueva con 30 minutos de tiempo base.
- Formatear el resultado en horas con un decimal amigable (ej: `0.5 h`, `3.2 h`, `6.0 h`).

### 3. Integración en `ChangelogEntry`
- Extender la interfaz `ChangelogEntry`:
  ```typescript
  export interface ChangelogStats {
    additions: number;
    deletions: number;
    estimatedHours: number;
    formattedHours: string;
  }
  export interface ChangelogEntry extends ... {
    ...
    stats: ChangelogStats;
  }
  ```

### 4. Presentación Visual en la UI (`src/pages/changelog.astro`)
- Renderizar en la cabecera de cada release card (junto a la fecha y versión):
  - Badge de adiciones: `+{additions}` con token visual verde (`text-success` / `bg-success/10`).
  - Badge de eliminaciones: `-{deletions}` con token visual rojo/error (`text-error` / `bg-error/10`).
  - Badge de horas aproximadas: ícono de reloj (`bx:time-five` o `bx:time`) seguido de `~{formattedHours}` con token neutro / sutil.
- Formato numérico homogéneo con separador de miles si superan 1,000 líneas (ej: `+1,250`).
- No mostrar adiciones/eliminaciones si ambas son 0.

## Non-Functional Requirements
- **Performance:** El cálculo de numstat y tiempos debe ejecutarse una sola vez por release y quedar retenido en el cache en memoria (`changelogCacheByDir`), con tiempo de respuesta sub-milisegundo en lecturas subsiguientes.
- **Fail-safe:** Si se corre en un contenedor o entorno sin binario git o en shallow clone, el servicio debe atrapar cualquier error y asignar métricas en cero sin romper el renderizado de la página.

## Acceptance Criteria
- Tests unitarios/dominio cubriendo el cálculo de numstat y el algoritmo de sesiones con casos de prueba conocidos.
- `npm run test:domain` pasa al 100%.
- La página `/changelog` renderiza los 3 indicadores con estilos de DaisyUI/Tailwind acordes a `docs/DESIGN.md`.
