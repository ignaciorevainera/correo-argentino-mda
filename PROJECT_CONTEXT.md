# PROJECT_CONTEXT

## Producto
Portal de la Mesa de Ayuda Interna

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
- Framework: Astro (output static)
- UI: Tailwind CSS + DaisyUI
- Integraciones: MDX + astro-icon + theme-change
- Datos y auth: sin base de datos y sin autenticacion
- Middleware: `src/middleware.ts` se mantiene como passthrough sin control de
   rutas privadas.

---

## Sistema de diseno y UX aprobado

### Tipografia y legibilidad
- Tipografia sans-serif moderna y legible para UI operativa.
- Tipografia monoespaciada para datos tecnicos: IPs, rutas, IDs y texto rigido.
- Jerarquia clara para escaneo rapido en contexto de soporte.

### Tema y color
- Soporte nativo claro/oscuro con selector global de tema.
- Acentos institucionales: amarillo y azul.
- Estados semanticos consistentes: exito, error y advertencia.

### Interaccion operativa
- Botones de copia rapida al portapapeles con feedback inmediato.
- Interacciones de baja friccion, sin ruido visual ni animaciones pesadas.
- Navegacion orientada a resolver tareas en pocos clics.

### Contrato de Barra Superior (Header/Topbar)
- El Header es un componente estructural critico: epicentro de orientacion
   global y quick actions.
- Debe ser delgado, minimamente invasivo y sticky en todo momento para no
   perder acceso a herramientas globales durante el scroll.
- Zona izquierda (contexto): muestra nombre dinamico de la ruta/pantalla
   activa. En mobile se oculta esta etiqueta para priorizar herramientas.
- Zona derecha (herramientas globales), en orden de izquierda a derecha:
   A. Busqueda maestra: omnibox/paleta/quick search con atajos. En desktop
   visible expandida; en mobile contraida a icono de lupa que abre modal.
   B. Preferencias: toggle dark/light con icono dinamico que comunique estado
   actual o accion de cambio.
   C. Alertas y sistema: centro de notificaciones con badge discreto para no
   leidas y acceso rapido a ayuda/manual.
- Reglas de intervencion del Header:
   - Jerarquia visual reducida: botones ghost, sin CTAs pesados.
   - Escalabilidad y agrupacion: divisores logicos entre bloques (por ejemplo,
      busqueda separada de utilidades).
   - Consistencia de temas: fondo, borde inferior, iconos y contraste segun
      tokens semanticos en light/dark.

### Lenguaje de interfaz
- Idioma principal: espanol.
- Estilo de escritura: sentence case para titulos y textos de UI.

---

## Sitemap funcional objetivo (11 vistas)

1. / - Dashboard principal: resumen operativo y accesos rapidos.
2. /titulos-tickets - Tipificacion de tickets con acciones de copia.
3. /buscador-usuarios - Busqueda de personal para validaciones de soporte.
4. /directorio-oficinas - Directorio operativo de oficinas y datos tecnicos.
5. /guia-soportes - Matriz de derivacion por tema y area de soporte.
6. /cronograma - Planificacion y calendario de tareas del equipo.
7. /cubics - Monitoreo y consulta de terminales remotas.
8. /mapa-sucursales - Vista geografica de cobertura y sucursales.
9. /inventario-terminales - Estado y asignacion del parque de terminales.
10. /enlaces-importantes - Hub de accesos externos e internos criticos.

---

## Estado actual vs roadmap objetivo

| Vista objetivo | Ruta roadmap | Estado actual en repo | Gap actual |
|---|---|---|---|
| Dashboard principal | / | Implementada como Home publico | Alinear copy y widgets al foco operativo N1/N2 |
| Titulos de tickets | /titulos-tickets | Implementada | Ajustar contenido al nuevo objetivo documental |
| Buscador de usuarios | /buscador-usuarios | Implementada | Revisar criterios finales de datos y permisos |
| Directorio de oficinas | /directorio-oficinas | Existe /oficinas-telegrafia | Definir si se renombra ruta o se mantiene alias documental |
| Guia de soportes | /guia-soportes | Implementada | Completar cobertura de casos por area |
| Cronograma | /cronograma | No implementada | Ruta pendiente |
| Cubics | /cubics | Implementada | Expandir para monitoreo operativo segun roadmap |
| Mapa de sucursales | /mapa-sucursales | No implementada | Ruta pendiente |
| Inventario de terminales | /inventario-terminales | No implementada | Ruta pendiente |
| Enlaces importantes | /enlaces-importantes | No implementada | Ruta pendiente |

Notas de trazabilidad:
- Rutas adicionales hoy presentes fuera del roadmap de 11 vistas:
   /documentacion y /design-system.
- Esta actualizacion documental no crea ni modifica rutas funcionales.

---

## Estado actual vs objetivo del Header

| Aspecto | Objetivo documental aprobado | Estado actual en BaseLayout | Gap actual |
|---|---|---|---|
| Rol estructural | Header critico para orientacion global y quick actions | Topbar minima con boton de drawer + texto fijo | Falta consolidar Header como centro unico de contexto y acciones globales |
| Comportamiento base | Siempre sticky, delgado y minimamente invasivo | No tiene comportamiento sticky declarado | Falta fijacion persistente durante scroll |
| Zona izquierda | Nombre dinamico de ruta/pantalla activa; oculto en mobile | Texto estatico "Portal Mesa de Ayuda" | Falta contexto dinamico por ruta y regla responsive de ocultamiento |
| Zona derecha A (busqueda) | Omnibox/paleta/quick search con atajos; desktop expandida y mobile por modal de lupa | No existe busqueda en Header | Falta bloque completo de busqueda maestra |
| Zona derecha B (preferencias) | Toggle dark/light con icono dinamico en Header | Toggle de tema existente pero ubicado en sidebar | Falta mover/normalizar preferencia como herramienta global de Header |
| Zona derecha C (alertas/sistema) | Notificaciones con badge discreto + acceso rapido a ayuda/manual | No hay centro de alertas/ayuda en Header | Falta bloque de alertas y soporte rapido |
| Jerarquia visual y tokens | Botones ghost, divisores por bloques, fondo/borde/iconos por tokens semanticos light/dark | Header actual usa fondo primario pleno y sin divisores funcionales de herramientas | Falta aplicar jerarquia reducida y agrupacion escalable |

---

## Reglas de intervencion

1. Mantener consistencia modular visual en contenedores, tarjetas y limpieza
   de interfaz.
2. Si se agrega una ruta o vista nueva, registrar el cambio en el orquestador
   principal de rutas y en la navegacion superior/lateral dinamica.
   Estado actual: el orquestador principal esta en src/layouts/BaseLayout.astro
   (arreglo navItems).
3. Componentes nuevos deben consumir referencias semanticas de color del sistema
   (tokens DaisyUI o variables de tema), evitando colores hardcodeados.

---

## Estado del proyecto

- Base funcional inicial disponible en rutas principales.
- Documentacion actualizada al nuevo marco de producto en fecha 2026-04-17.
- Pendiente implementacion de rutas roadmap no existentes.
