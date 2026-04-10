# PROJECT_CONTEXT

## Nombre del proyecto
Mesa de Ayuda - Correo Argentino

## Descripcion
Plataforma web centralizada para uso interno de la mesa de ayuda, destinada a agilizar el soporte técnico. Reúne documentación (MDX), catálogos de oficinas, estandarización de tickets, registro de ordenadores remotos (cubics), links de descarga y guías de derivación en un solo lugar.

## Publico objetivo
Analistas y agentes de soporte técnico (Mesa de Ayuda) de Correo Argentino. Perfil técnico medio/avanzado, que necesita acceder a la información de forma extremadamente rápida durante la atención.

---

## BRIEFING DE ESTRUCTURA

### Paginas del sitio
- `/` (Home / Dashboard) - **Público**
- `/titulos-tickets` (Catálogo de títulos de tickets) - **Público**
- `/documentacion` (Base de conocimientos) - **Público**
- `/guia-soportes` (Matriz de derivación de soporte) - **Público**
- `/buscador-usuarios` (Búsqueda por DNI) - **Privado (Requiere Auth)**
- `/oficinas-telegrafia` (Catálogo de oficinas de telegrafía) - **Privado (Requiere Auth)**
- `/cubics` (Registro de ordenadores remotos) - **Privado (Requiere Auth)**
- `/configuracion` (Ajustes de cuenta y preferencias) - **Privado (Requiere Auth)**

### Secciones obligatorias por pagina

Home (Dashboard):
  - Buscador principal destacado en el header (con atajo de teclado tipo `⌘K` o `Ctrl+K`).
  - "Accesos Rápidos": Grilla principal con tarjetas (cards) grandes y muy visuales que funcionen como atajos directos a las distintas secciones del sitio (Títulos, Buscador, Oficinas, Documentación, Cubics).
  - Vista previa o widget de la tabla estática de "Cubics (Ordenadores Remotos)".
  - Sección de "Actividad Reciente" para retomar rápidamente documentos, herramientas o tickets recientes.

Títulos de Tickets:
  - Grilla con tarjetas (cards) categorizadas.
  - Títulos predefinidos con botón de "Copiar al portapapeles" para agilizar la carga.

Buscador de usuarios:
  - Input de búsqueda rápida por DNI o número de documento.
  - Tarjeta de resultados con los datos básicos del usuario para su rápida identificación.

Oficinas-telegrafia:
  - Listado o grilla de oficinas.
  - Filtros y etiquetas para visualizar las distintas propiedades y características de cada sucursal (IPs, cantidad de servidores, usuarios, teléfonos, dirección).

Documentación:
  - Índice interno de documentos.
  - Visor de archivos `.mdx` importados desde Notion.

Guía de Soportes:
  - Tabla de datos ordenable.
  - Columnas clave: Área/Nivel de soporte, Temas que tratan, y Ruta/Cómo buscarlos en la herramienta de generación de tickets.

Cubics (Ordenadores remotos):
  - Listado o tabla estática del parque de máquinas remotas.
  - Columnas/Datos clave: Nombre del equipo, Dirección IP y Asignado (A quién de la mesa de ayuda le pertenece o lo está usando).
  - Filtro o buscador rápido por IP o nombre de usuario.

### Componentes globales
- **Panel lateral (Sidebar) minimizable:** Estilo Gemini. Cuando está abierto muestra los nombres de las secciones; cuando se minimiza, solo muestra los íconos limpios para maximizar el espacio de lectura. Incluye el perfil del usuario logueado en la parte inferior (si inició sesión).
- **Barra de búsqueda global:** Accesible desde cualquier página (siempre en el top bar) para buscar documentación, oficinas, usuarios o cubics instantáneamente mediante atajo de teclado. Los resultados se filtrarán según el estado de autenticación del usuario.
- **Navegación por migas de pan (Breadcrumbs):** Para ubicarse fácilmente dentro de la documentación o catálogos.

---

## BRIEFING VISUAL

### Tono estetico
Minimalista, simple y utilitario. Debe sentirse como una herramienta de productividad ágil (estilo Notion o Linear). Enfocado 100% en la claridad, la lectura rápida, el orden de la información y la fácil indexación. Sin distracciones. Uso de *badges* (etiquetas) para identificar categorías rápidamente.

### Referencias visuales
- **Mockup propio (Referencia principal):** UI estructurada en dashboard, sidebar oscuro/neutro, contenido principal con tarjetas de accesos rápidos grandes y de bordes sutiles, tipografía sans-serif limpia y atajos de teclado visibles.
- https://gemini.google.com/ (Por el comportamiento del panel lateral minimizable y la limpieza de la interfaz).
- https://notion.so/ (Por el manejo de la documentación y bases de datos limpias).

### Preferencia de modo
Ambos (claro por defecto, con modo oscuro disponible para reducir la fatiga visual de los agentes durante los turnos largos).

### Restricciones visuales
- Sin animaciones lentas o complejas que demoren la interacción.
- Sin paletas de colores invasivas o excesivamente brillantes; priorizar fondos neutros y usar color solo para estados y etiquetas de categorías.

## Estilos y diseno
- **Colores Base de Marca:**
  - `primary`: #FFE600 (Amarillo)
  - `secondary`: #004C97 (Azul - Usado también para la línea Institucional/Paquetería)
- **Líneas de Negocio (Categorías):**
  *(Estos colores deben usarse para diferenciar visualmente etiquetas, filtros y tarjetas de soporte según el sector)*
  - `postal`: #E3000F (Rojo)
  - `logistica`: #4D4D4D (Gris oscuro)
  - `financiero`: #008040 (Verde)
- **Colores Semánticos / Estados:**
  - `info`: #00A4E0
  - `success`: #008040
  - `warning`: #FFE600
  - `error`: #E3000F
  - `neutral`: #F2F2F2

---

## BRIEFING FUNCIONAL

### Funcionalidades que el proyecto necesita
- Motor de búsqueda global robusto (que indexe títulos, MDX y tablas estáticas) accesible vía teclado (`Cmd+K` / `Ctrl+K`).
- Panel lateral colapsable responsivo.
- Renderizado de archivos `.mdx` (Markdown con componentes interactivos).
- Filtros dinámicos en los catálogos (oficinas, soportes y cubics).
- Portapapeles dinámico (botones de 1 clic para copiar títulos de tickets, datos de oficinas o IPs de los cubics).

### Base de datos y Gestión de Datos
- **Sitio mayoritariamente estático:** Las secciones de Títulos de Tickets, Buscador de Usuarios (DNIs pre-cargados), Guía de Soportes y Registro de Cubics operarán con **datos estáticos** (archivos JSON o similares integrados en el código) que se actualizarán manualmente. No habrá monitoreo en tiempo real del estado de los cubics, solo registro de datos.
- **Base de Datos Dinámica (Solo para Oficinas):** Se utilizará una base de datos para gestionar el catálogo de "Oficinas de Telegrafía". Esta tabla almacenará atributos complejos y variables como: IP de la oficina, cantidad de servidores, lista de usuarios, números de teléfono y dirección postal.
- **Documentación:** Se leerá desde archivos `.mdx` locales, sin requerir base de datos tradicional.

### Autenticacion
Parcial (Acceso mixto).
- **Secciones Públicas (Sin login):** Home, Títulos de Tickets, Documentación y Guía de Soportes. No requieren autenticación ya que no contienen información sensible ni comprometen la seguridad de la empresa.
- **Secciones Privadas (Con login obligatorio):** Buscador de Usuarios, Oficinas de Telegrafía y Cubics. Requieren autenticación estricta ya que exponen datos personales de usuarios, direcciones IP y otra información interna sensible. Si un usuario no autenticado intenta acceder a estas rutas, será redirigido a la pantalla de login.

---

## ESTADO ACTUAL
Proyecto recien iniciado. Pendiente sesion de diseno con agente kickstart.

## Proximos pasos
- Completar STACK.md
- Sesion de diseno con agente kickstart