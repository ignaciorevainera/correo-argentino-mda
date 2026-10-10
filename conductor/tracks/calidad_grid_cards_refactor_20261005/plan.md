# Plan de Implementación: Refactor Visual de Grilla y Tarjetas de Operadores

## Fase 1: Espaciado Superior y Barra de Herramientas Compacta
- [x] Task: Compactar espaciado superior y reestructurar barra de herramientas en `CalidadContent.astro` [a76e789]
  - [x] Reducir el margen superior entre `PageHeader` y la barra de herramientas a `mt-2` y `mb-4`
  - [x] Ajustar el buscador a un ancho compacto y ergonómico con foco refinado
  - [x] Agrupar selector de mes, controles de navegación y botón "Parámetros" con estilo discreto
  - [x] Destacar el botón "Nueva auditoría" como acción primaria con `btn-primary` y sombra sutil
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Fase 2: Rediseño de Tarjetas de Operador y Grilla Responsive
- [x] Task: Modernizar la tarjeta de operador `.operator-card` en `CalidadContent.astro` [a76e789]
  - [x] Aplicar contenedor ligero con fondo blanco/base-100, borde sutil `border-base-200/80` y sombra suave `shadow-xs hover:shadow-md`
  - [x] Implementar avatar redondeado estilizado con iniciales en `bg-secondary/10 text-secondary font-bold`
  - [x] Priorizar jerarquía tipográfica: nombre en `font-bold text-base text-base-content`, `@legajo` en `font-mono text-xs text-base-content/50`
  - [x] Implementar chips de porcentaje de rendimiento accesibles y translúcidos (`bg-success/10 text-success`, `bg-warning/10 text-warning`, `bg-error/10 text-error`)
  - [x] Convertir la métrica de auditorías a "X de 12 completadas" junto a una barra de progreso delgada de 1.5px (`h-1.5`)
  - [x] Asegurar transiciones suaves en estados `hover`, `focus-visible` y `active`
- [x] Task: Ajustar la cuadrícula responsive [a76e789]
  - [x] Configurar columnas adaptativas: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Fase 3: Verificación Integral, Pruebas E2E y Build
- [x] Task: Verificar y actualizar pruebas E2E en Playwright (`tests/calidad-ui-refactor.spec.ts`) [a76e789]
  - [x] Confirmar que los selectores de tarjeta, buscador, métricas y modal pasen exitosamente
- [x] Task: Verificación de compilación SSR [a76e789]
  - [x] Ejecutar `npm run build` para asegurar ausencia de errores en server entry y verificación de assets
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)
