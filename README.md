# Portal de la Mesa de Ayuda Interna

Portal interno de Correo Argentino orientado a soporte corporativo logistico
y postal. El objetivo es centralizar y agilizar el trabajo diario de
operadores N1/N2.

## Objetivo principal

Unificar en una sola plataforma:
- tipificacion de tickets
- busqueda de personal
- monitoreo de terminales
- gestion de carga laboral

## Sistema UX/UI aprobado

- Tipografia legible para UI y tipografia monoespaciada para datos tecnicos.
- Soporte claro/oscuro global con selector de tema.
- Acentos institucionales amarillo/azul con estados semanticos consistentes.
- Interacciones de copia rapida para acelerar tareas operativas.
- Idioma en espanol con sentence case en titulos y textos de interfaz.

## Contrato de Barra Superior (Header/Topbar)

- Rol: componente estructural critico, epicentro de orientacion global y
  quick actions.
- Comportamiento base: Header delgado, minimamente invasivo y sticky siempre.
- Zona izquierda: nombre dinamico de la ruta/pantalla activa; en mobile se
  oculta esta etiqueta para priorizar herramientas.
- Zona derecha (izquierda a derecha):
  A. Busqueda maestra (omnibox/paleta/quick search): desktop expandida,
  mobile en icono de lupa que abre modal.
  B. Preferencias: toggle dark/light con icono dinamico.
  C. Alertas y sistema: notificaciones con badge discreto + acceso rapido a
  ayuda/manual.
- Reglas visuales: botones ghost, divisores logicos entre bloques y
  consistencia por tokens semanticos de tema (fondo, borde, iconos, contraste).

Estado actual vs objetivo:
- El `BaseLayout` actual aun no implementa por completo este contrato del
  Header.
- Hoy la topbar es basica (menu + texto fijo), el toggle de tema vive en la
  sidebar y no existe aun el bloque integral de busqueda/alertas/ayuda.
- Esta directriz deja definido el objetivo documental para implementacion
  posterior sin declarar funcionalidades inexistentes.

## Stack real del proyecto

- Astro (output static)
- Tailwind CSS + DaisyUI
- Sin base de datos y sin autenticacion
- MDX + astro-icon

## Estado actual vs roadmap

Rutas implementadas hoy:
- /
- /titulos-tickets
- /documentacion
- /guia-soportes
- /buscador-usuarios
- /oficinas-telegrafia
- /cubics
- /configuracion
- /design-system

Roadmap funcional objetivo (11 vistas):
- /
- /titulos-tickets
- /buscador-usuarios
- /directorio-oficinas
- /guia-soportes
- /cronograma
- /cubics
- /mapa-sucursales
- /inventario-terminales
- /enlaces-importantes
- /configuracion

Gap principal documentado:
- El roadmap define /directorio-oficinas, mientras que en el repo actual existe
  /oficinas-telegrafia.
- /cronograma, /mapa-sucursales, /inventario-terminales y
  /enlaces-importantes aun no tienen implementacion.

## Reglas de intervencion

- Mantener consistencia modular visual (contenedores, tarjetas y limpieza).
- Si se agrega una ruta, registrar en el orquestador principal de navegacion:
  src/layouts/BaseLayout.astro (arreglo navItems) y reflejar el cambio en la
  navegacion dinamica de sidebar/topbar cuando aplique.
- Usar colores semanticos del sistema (tokens DaisyUI) para componentes nuevos.

## Documentos de referencia

- PROJECT_CONTEXT.md
- DESIGN_SYSTEM.md
- STACK.md
