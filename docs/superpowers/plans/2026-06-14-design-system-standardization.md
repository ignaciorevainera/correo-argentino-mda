# Estandarización de Sistema de Diseño y Refactorización de Valores Arbitrarios

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalizar el sistema de diseño del proyecto mediante la estandarización global de `border-radius`, la eliminación de clases tipográficas/sombreadas hardcodeadas y la centralización de estos tokens en Tailwind CSS v4.

**Architecture:** Mapeo de clases `rounded-*` de Tailwind a las variables dinámicas de DaisyUI v4 (`--radius-box`, `--radius-field`, `--radius-selector`) dentro del bloque `@theme` de `src/styles/global.css`. Registro de nuevos tamaños de tipografía (`text-xxs`, `text-tiny`, `text-micro`, `text-small`), sombras semánticas y anchos mínimos de componentes para luego reemplazar todos los valores bracket/arbitrarios dispersos en el HTML de forma segura.

**Tech Stack:** Astro, Tailwind CSS v4, DaisyUI v4, TypeScript

---

## Proposed Changes

### Task 1: Configuración de Tokens en el Tema Global

**Files:**
- Modify: [global.css](file:///e:/Dev/proyectos/correo-argentino-mda/src/styles/global.css)

- [ ] **Paso 1: Agregar extensiones del tema en global.css**
  Reemplazar el bloque `@theme` existente agregando las siguientes definiciones:
  ```css
  @theme {
    /* ... (mantener fuentes y colores institucionales existentes) ... */

    /* Nuevos tamaños de fuente semánticos para evitar brackets */
    --font-size-small: 11px;
    --font-size-small--line-height: 15px;
    --font-size-xxs: 10px;
    --font-size-xxs--line-height: 14px;
    --font-size-tiny: 9px;
    --font-size-tiny--line-height: 12px;
    --font-size-micro: 8px;
    --font-size-micro--line-height: 10px;

    /* Dimensiones semánticas */
    --min-w-table-min: 600px;
    --min-w-sidebar-expanded: 16rem;
    --min-w-sidebar-collapsed: 11rem;
    --spacing-sidebar-expanded: 16rem;
    --spacing-sidebar-collapsed: 11rem;
    --inset-sidebar-expanded: 16rem;

    /* Sombras semánticas */
    --shadow-glow-success: 0 0 8px rgba(6, 132, 68, 0.4);
    --shadow-glow-warning: 0 0 8px rgba(226, 173, 31, 0.4);
    --shadow-table-edge: 4px 0 10px -5px rgba(0, 0, 0, 0.05);

    /* Estandarización de DaisyUI border-radius variables */
    --radius-box: var(--radius-box);
    --radius-field: var(--radius-field);
    --radius-selector: var(--radius-selector);

    /* Sobrescribir las utilidades por defecto de Tailwind para alinearlas al sistema de DaisyUI */
    --radius-xs: var(--radius-selector);
    --radius-sm: var(--radius-selector);
    --radius-md: var(--radius-field);
    --radius-lg: var(--radius-field);
    --radius-xl: var(--radius-box);
    --radius-2xl: var(--radius-box);
    --radius-3xl: var(--radius-box);
  }
  ```

### Task 2: Refactorización en Componentes de Administración y Supervisión (Subagent A)

**Files:**
- Modify: [AdminOperadoresContent.astro](file:///e:/Dev/proyectos/correo-argentino-mda/src/components/admin/operadores/AdminOperadoresContent.astro)
- Modify: [AuditLogsTimeline.astro](file:///e:/Dev/proyectos/correo-argentino-mda/src/components/admin/AuditLogsTimeline.astro)
- Modify: [AdminAplicativosContent.astro](file:///e:/Dev/proyectos/correo-argentino-mda/src/components/admin/aplicativos/AdminAplicativosContent.astro)
- Modify: [EstadisticasContent.astro](file:///e:/Dev/proyectos/correo-argentino-mda/src/components/supervision/asistencia/EstadisticasContent.astro)
- Modify: [CalidadContent.astro](file:///e:/Dev/proyectos/correo-argentino-mda/src/components/supervision/calidad/CalidadContent.astro)
- Modify: [[id].astro](file:///e:/Dev/proyectos/correo-argentino-mda/src/pages/admin/cubics/%5Bid%5D.astro)
- Modify: [[id].astro](file:///e:/Dev/proyectos/correo-argentino-mda/src/pages/admin/operadores/%5Bid%5D.astro)

- [ ] **Paso 1: Reemplazar clases arbitrarias de tipografía en componentes de administración**
  - En `AdminOperadoresContent.astro`, cambiar `text-[9px]` por `text-tiny`.
  - En `AuditLogsTimeline.astro`, cambiar `text-[9px]` por `text-tiny` y `text-[10px]` por `text-xxs`.
  - En `AdminAplicativosContent.astro`, cambiar `min-w-[600px]` por `min-w-table-min`.
  - En `EstadisticasContent.astro`, cambiar `text-[10px]` por `text-xxs`, `text-[9px]` por `text-tiny`, `text-[8px]` por `text-micro`, y las clases JS de celda que usen `text-[10px]`.
  - En `CalidadContent.astro`, cambiar `text-[10px]` por `text-xxs`.
  - En `pages/admin/cubics/[id].astro`, cambiar `text-[10px]` por `text-xxs`.
  - En `pages/admin/operadores/[id].astro`, cambiar `text-[10px]` por `text-xxs` en leyendas y párrafos informativos.

### Task 3: Refactorización en Componentes Generales y Layout (Subagent B)

**Files:**
- Modify: [BuscadorUsuariosContent.astro](file:///e:/Dev/proyectos/correo-argentino-mda/src/components/buscador-usuarios/BuscadorUsuariosContent.astro)
- Modify: [BaseLayout.astro](file:///e:/Dev/proyectos/correo-argentino-mda/src/layouts/BaseLayout.astro)
- Modify: [profile.astro](file:///e:/Dev/proyectos/correo-argentino-mda/src/pages/profile.astro)

- [ ] **Paso 1: Eliminar clases tipográficas bracketed en componentes globales**
  - En `BuscadorUsuariosContent.astro`, cambiar `text-[10px]` por `text-xxs` en las insignias construidas dinámicamente en JS.
  - En `BaseLayout.astro`, cambiar `text-[10px]` por `text-xxs` en la etiqueta del usuario logueado.
  - En `profile.astro`, cambiar `text-[10px]` por `text-xxs` en la etiqueta de sección/metadatos.

### Task 4: Refactorización en el Módulo de Cronograma (Subagent C)

**Files:**
- Modify: [dashboard-client.ts](file:///e:/Dev/proyectos/correo-argentino-mda/src/components/cronograma/lib/dashboard-client.ts)

- [ ] **Paso 1: Reemplazar valores arbitrarios de tipografía, dimensiones y sombras en el cliente del cronograma**
  - Reemplazar `text-[10px]` por `text-xxs` (ej. en el dropdown de meses y cabeceras).
  - Reemplazar `text-[9px]` por `text-tiny` (ej. en las barras de Gantt).
  - Reemplazar `text-[8.5px]` por `text-tiny` para normalizar.
  - Reemplazar `text-[11px]` por `text-small`.
  - Reemplazar `min-w-[16rem]` por `min-w-sidebar-expanded`.
  - Reemplazar `min-w-[11rem]` por `min-w-sidebar-collapsed`.
  - Reemplazar `left-[16rem]` por `left-sidebar-expanded`.
  - Reemplazar `shadow-[0_0_8px_rgba(6,132,68,0.4)]` por `shadow-glow-success`.
  - Reemplazar `shadow-[0_0_8px_rgba(226,173,31,0.4)]` por `shadow-glow-warning`.
  - Reemplazar `shadow-[4px_0_10px_-5px_rgba(0,0,0,0.05)]` por `shadow-table-edge`.

### Task 5: Actualizar Documentación del Sistema de Diseño

**Files:**
- Modify: [DESIGN.md](file:///e:/Dev/proyectos/correo-argentino-mda/DESIGN.md)

- [ ] **Paso 1: Registrar las decisiones de diseño del border-radius, tipografía y sombras**
  Añadir secciones explícitas en `DESIGN.md` detallando:
  - La equivalencia de bordes normalizados mediante DaisyUI en Tailwind v4 (`rounded-sm`/`rounded-md` -> `rounded-selector`/`rounded-field`, etc.).
  - Los nuevos tokens tipográficos de tamaño extendido (`text-xxs`, `text-tiny`, `text-micro`, `text-small`).
  - Las nuevas utilidades de sombras semánticas (`shadow-glow-success`, `shadow-glow-warning`, `shadow-table-edge`).

---

## Verification Plan

### Automated Tests
- Ejecutar el compilador de Astro para comprobar que no existan errores sintácticos ni de importación:
  `npm run build`

### Manual Verification
- Comprobar visualmente mediante el navegador (en `npx astro dev`) que:
  - Los bordes (`border-radius`) de tarjetas, botones e inputs luzcan uniformes y respeten la configuración del tema dinámico.
  - El sidebar y las columnas fijadas del cronograma no sufran desalineaciones.
  - Las sombras de estado en el cronograma se muestren correctamente y con el mismo desenfoque.
  - El tamaño y legibilidad de textos pequeños sea óptimo y consistente en pantallas desktop y móviles.
