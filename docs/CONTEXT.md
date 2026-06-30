# CONTEXT

## Producto

Portal de la Mesa de Ayuda

## Descripcion

Portal interno para soporte corporativo logistico y postal de Correo Argentino.
Centraliza herramientas de operacion diaria para reducir tiempos de atencion,
disminuir errores de carga y mejorar la trazabilidad de casos N1/N2.

## Objetivo principal

Centralizar y agilizar tareas de operadores N1/N2 con herramientas para:

- tipificacion de tickets
- busqueda de personal
- monitoreo de terminales
- gestion de carga laboral

## Publico objetivo

Operadores N1 y N2 de mesa de ayuda interna, con foco en soporte corporativo
de operaciones logisticas y postales.

## Stack real del repositorio

- Framework: Astro (output: 'server' / SSR) con adaptador `@astrojs/node`
- UI: Tailwind CSS v4 + DaisyUI v5
- Integraciones: `@astrojs/react` para islas interactivas, MDX, `astro-icon` y `theme-change`
- Datos y auth: Base de datos local SQLite (`src/db/sqlite.db`) con Drizzle ORM y autenticación basada en sesión
- Middleware: `src/middleware.ts` gestiona la autenticación activa y controla el acceso según roles (agente, referent, supervisor, admin)

---

## Sistema de diseno y UX aprobado

### Tipografia y legibilidad

- Tipografia sans-serif moderna y legible para UI operativa (`Geist Variable`).
- Tipografia monoespaciada para datos tecnicos: IPs, rutas, IDs y texto rigido (`Geist Mono Variable`).
- Jerarquia clara para escaneo rapido en contexto de soporte.

### Tema y color

- Soporte nativo claro/oscuro con selector global de tema y persistencia.
- Acentos institucionales: amarillo (`primary` / school-bus-yellow) y azul (`secondary` / steel-azure).
- Estados semanticos consistentes: exito, error y advertencia.

### Interaccion operativa

- Botones de copia rapida al portapapeles con feedback inmediato.
- Interacciones de baja friccion, sin ruido visual ni animaciones pesadas.
- Navegacion orientada a resolver tareas en pocos clics.

### Contrato de Barra Superior (Header/Topbar)

- El Header es un componente estructural critico: epicentro de orientacion global y quick actions.
- Es delgado, sticky y accesible de forma persistente.
- Zona izquierda (contexto): muestra nombre dinamico de la ruta activa y se oculta en mobile.
- Zona derecha (herramientas globales), en orden de izquierda a derecha:
  A. Busqueda maestra: command palette integrada con atajo `Ctrl+K`.
  B. Preferencias: toggle dark/light con icono dinamico y persistencia en localStorage.
  C. Alertas y sistema: diálogo informativo de proyecto ("Acerca de") con detalles de versión y autores.
- Reglas de intervencion del Header:
  - Jerarquia visual reducida: botones ghost sin CTAs pesados.
  - Escalabilidad y agrupacion: divisores logicos de bloques entre busqueda y herramientas.
  - Consistencia de temas: adaptado a tokens semanticos en light/dark.

### Lenguaje de interfaz

- Idioma principal: espanol.
- Estilo de escritura: sentence case para titulos y textos de UI.

---

## Sitemap funcional objetivo (11 vistas)

1. / - Dashboard principal: resumen operativo de la mesa de ayuda.
2. /supervision - Panel de Supervisión y gestión operativa (Cronograma, Calidad, Asignación de autogestiones).
3. /titulos-tickets - Tipificacion de tickets con acciones de copia.
4. /guia-soportes - Matriz de derivacion por tema y area de soporte.
5. /buscador-usuarios - Busqueda de personal y validación de usuarios.
6. /generador-firmas - Creador de firmas institucionales para operadores.
7. /contactos - Directorio de números y correos útiles.
8. /enlaces-recursos - Hub de accesos a recursos externos e internos (Catálogo de aplicativos).
9. /directorio-oficinas - Directorio de oficinas, activos de red y datos técnicos.
10. /inventario-equipos - Consulta y estado del parque de terminales (Cubic, etc.).
11. /admin - Panel de administración para gestión de base de datos, usuarios, auditorías y logs.

---

## Estado actual vs roadmap objetivo

| Vista objetivo           | Ruta roadmap           | Estado actual en repo          | Gap actual                                                 |
| ------------------------ | ---------------------- | ------------------------------ | ---------------------------------------------------------- |
| Dashboard principal      | /                      | Implementado                   | Consolidado con métricas operativas del equipo             |
| Supervisión y control    | /supervision           | Implementado                   | Gestión activa de cronogramas y auditorías de calidad      |
| Títulos de tickets       | /titulos-tickets       | Implementado                   | Listado operativo con copia rápida                         |
| Guía de soportes         | /guia-soportes         | Implementado                   | Mapeo relacional de soporte por área                       |
| Buscador de usuarios     | /buscador-usuarios     | Implementado                   | Filtros dinámicos de personal                              |
| Generador de firmas      | /generador-firmas      | Implementado                   | Generación y descarga visual de firmas de correo           |
| Contactos                | /contactos             | Implementado                   | Acceso rápido a datos telefónicos y enlaces                |
| Enlaces y recursos       | /enlaces-recursos      | Implementado                   | Hub de accesos externos y catálogo de aplicativos          |
| Directorio de oficinas   | /directorio-oficinas   | Implementado                   | Búsqueda de oficinas conectada a base de datos             |
| Inventario de equipos    | /inventario-equipos    | Implementado                   | Monitoreo técnico de terminales y hostnames                |
| Panel de administración  | /admin                 | Implementado                   | Consola administrativa CRUD completa y registro de auditorías |

Notas de trazabilidad:

- La transición de la aplicación estática a SSR dinámica ha finalizado exitosamente.
- Las rutas del sitemap objetivo se encuentran completadas al 100% y enlazadas a la persistencia SQLite.

---

## Estado actual vs objetivo del Header

| Aspecto                          | Objetivo documental aprobado                                                              | Estado actual en BaseLayout                                                        | Gap actual                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Rol estructural                  | Header critico para orientacion global y quick actions                                    | Integrado como barra global unificada                                              | Ninguno, rol consolidado                                                  |
| Comportamiento base              | Siempre sticky, delgado y minimamente invasivo                                            | Comportamiento sticky y responsive activo                                           | Ninguno                                                                   |
| Zona izquierda                   | Nombre dinamico de ruta/pantalla activa; oculto en mobile                                 | Refleja el título dinámico según la ruta activa; oculto en móviles                | Ninguno                                                                   |
| Zona derecha A (busqueda)        | Omnibox/paleta/quick search con atajos; desktop expandida y mobile por modal de lupa      | Command Palette operativa con modal y atajo `Ctrl+K`                               | Ninguno                                                                   |
| Zona derecha B (preferencias)    | Toggle dark/light con icono dinamico en Header                                            | Swap icon integrado en el Header con persistencia de tema                          | Ninguno                                                                   |
| Zona derecha C (alertas/sistema) | Notificaciones con badge discreto + acceso rapido a ayuda/manual                          | Modal "Acerca del proyecto" con datos del equipo, versión y año                    | Integración del sistema de ayuda/acerca del proyecto completada           |
| Jerarquia visual y tokens        | Botones ghost, divisores por bloques, fondo/borde/iconos por tokens semanticos light/dark | Estructura limpia y uso de tokens semánticos adaptados a los temas                | Ninguno                                                                   |

---

## Reglas de intervencion

1. Mantener consistencia modular visual en contenedores, tarjetas y limpieza de interfaz.
2. Si se agrega una ruta o vista nueva, registrar el cambio en el archivo de navegación `@lib/navigation.ts` para que se propague automáticamente al sidebar, header y command palette.
3. Componentes nuevos deben consumir referencias semanticas de color del sistema (tokens DaisyUI o variables de tema), evitando colores hardcodeados.
4. Ante la creación de una nueva pantalla de gestión (CRUD) o modificación de tablas de la base de datos a nivel administrativo, se debe invocar explícitamente a `logAdminAction` (`@lib/auditLogger`) para dejar registro detallado y específico de la acción realizada en la tabla de auditoría (`audit_logs`).

---

## Estado del proyecto

- Base de datos relacional SQLite local activa y conectada.
- Sistema de autenticación de usuarios implementado y controlado por middleware de sesión según roles.
- Las 11 vistas operativas principales están implementadas y funcionales en producción.
- Contrato del Header global completamente implementado y cerrado.
