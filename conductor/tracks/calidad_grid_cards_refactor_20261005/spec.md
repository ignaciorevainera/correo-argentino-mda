# Especificación: Refactor Visual de Grilla y Tarjetas de Operadores en Calidad

## Resumen Ejecutivo
Modernizar la interfaz visual de la grilla de operadores y la barra de herramientas en `/supervision/calidad-operadores` para dotarla de un aspecto ligero, limpio y con una clara jerarquía visual:
- Reducir el espacio muerto superior entre la cabecera y el contenido.
- Agrupar los controles en una barra de herramientas compacta con "Nueva auditoría" como acción primaria destacada.
- Diseñar tarjetas de operadores limpias, con bordes muy sutiles, sombras suaves y amplia separación interna.
- Destacar el nombre del operador y el porcentaje global de calidad como elementos clave.
- Utilizar tonos de rendimiento menos saturados y más accesibles (chips translúcidos con fondo suave y borde sutil).
- Presentar la métrica de auditorías con el formato visual "X de 12 completadas" junto a una barra de progreso estilizada.

## Requisitos Funcionales

1. **Espaciado Superior y Cabecera Compacta:**
   - Reducir el margen superior entre `PageHeader` y la barra de herramientas a un espaciado equilibrado (`mt-2` a `mt-3`, `mb-4`).
   - Mantener alineación coherente del contenedor principal.

2. **Barra de Herramientas Compacta:**
   - Buscador estilizado a la izquierda con padding ergonómico y respuesta instantánea.
   - Controles secundarios en el extremo derecho: selector de mes compacto con botones de navegación anterior/siguiente y botón secundario/outline para "Parámetros".
   - Botón primario "Nueva auditoría" destacado con color `btn-primary`, elevación sutil y mayor contraste.

3. **Diseño de Tarjetas de Operador (`.operator-card`):**
   - Contenedor con `bg-base-100`, borde suave `border-base-200/80` y sombra sutil `shadow-xs hover:shadow-md`.
   - Transiciones fluidas en hover/focus (`hover:border-secondary/40`, `focus-visible:ring-2 focus-visible:ring-secondary/50`).
   - Avatar de iniciales en contenedor redondeado estilizado con fondo `bg-secondary/10` y texto `text-secondary font-bold`.
   - Jerarquía tipográfica:
     - Nombre del operador en primer nivel: `font-bold text-base text-base-content tracking-tight`.
     - Legajo/username en segundo plano: `font-mono text-xs text-base-content/50 lowercase`.
     - Insignia de excelencia discreta pero distinguible (`text-secondary`).
   - Chips de rendimiento accesibles y translúcidos:
     - Score >= 90%: verde accesible (`bg-success/10 text-success border border-success/20`).
     - Score 80-89%: ámbar accesible (`bg-warning/10 text-warning border border-warning/20`).
     - Score < 80%: rojo accesible (`bg-error/10 text-error border border-error/20`).
   - Métrica visual de progreso:
     - Formato descriptivo: "X de 12 completadas".
     - Barra de progreso delgada y refinada (`h-1.5 rounded-full bg-base-200`), con fill en color secundario o estado correspondiente.

4. **Grilla Responsive:**
   - 1 columna en móvil (`grid-cols-1`).
   - 2 columnas en tablet (`sm:grid-cols-2`).
   - 3 columnas en pantallas medianas (`lg:grid-cols-3`).
   - 4 columnas en escritorios grandes (`xl:grid-cols-4`).
   - Gap consistente `gap-4`.

## Requisitos No Funcionales y Restricciones
- Respetar el contrato de diseño en `docs/DESIGN.md` y `AGENTS.md`: tokens semánticos DaisyUI v5 sin colores hex hardcodeados.
- Preservar todos los atributos DOM existentes (`.operator-card`, `data-operator-id`, `data-name`, `data-id`, `data-username`, `data-operator`) para mantener el soporte de pruebas E2E y filtrado en vivo.
- Compilación limpia con `npm run build` sin advertencias SSR.

## Criterios de Aceptación
- La barra superior y la grilla cargan con espaciado compacto y estética moderna de dashboard.
- El filtrado interactivo en tiempo real funciona sin fallos.
- Al hacer clic en una tarjeta, se abre el modal de detalles con los datos correspondientes.
- La suite de pruebas E2E en Playwright (`tests/calidad-ui-refactor.spec.ts`) pasa al 100%.
