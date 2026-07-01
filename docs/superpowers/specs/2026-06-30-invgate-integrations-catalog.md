# InvGate API — Catálogo de Integraciones

**Base URL:** `INVGATE_BASE_URL/api/v1/`  
**Auth:** Basic `portalmda:API_KEY` (manejado por `invgateGet<T>()`)  
**Versión API testeada:** Correo Argentino SD v8.15.13 (24 endpoints verificados)

---

## 1. Helpdesks

### Recurso API
```
GET /helpdesks
  Params: id, name, include_deleted
  Response: [{ id, name, parent_id, status_id, engine_id, total_members }]

GET /helpdesks.observers
  Params: ids[] (ARRAY, opcional)
```

### Integraciones

#### 1-A. Sincronizar mesas de ayuda con guía de soportes
- **Propósito:** Cruzar las helpdesks activas de InvGate con la tabla `support_guides` (campo `invgate_name`) para mantener actualizada la guía de soportes del MDA.
- **API:** `GET /helpdesks`
- **Qué habilita:**
  - Vista admin que muestra helpdesks InvGate → support_guides locales, con estado "sincronizado / faltante / sin mapear"
  - Detección de helpdesks nuevas en InvGate no registradas en la guía
  - Detección de helpdesks eliminadas/desactivadas que siguen en la guía
- **Notas:** La tabla `support_guides` ya tiene el campo `invgate_name` diseñado para esto.

#### 1-B. Agentes por mesa de ayuda
- **Propósito:** Mostrar qué agentes cubren cada helpdesk.
- **API:** `GET /helpdesks.observers?ids[]=X&ids[]=Y`
- **Qué habilita:**
  - En la guía de soportes, ver los agentes asignados a cada mesa
  - Saber a quién contactar para cada helpdesk
- **Alternativa:** El campo `contacts` en `support_guides` ya existe; se podría precargar desde InvGate.

---

## 2. Usuarios

### Recurso API
```
GET /user?id=X
  Response: InvgateUser (object)

GET /users
  Params: ids[] (ARRAY, opcional), include_disabled
  Response: [ InvgateUser, ... ]

GET /users.by
  Params: username, email, phone, exact_match, include_disabled, page_key
  Response: { data: { "id": { user }, ... }, next_page_key }

GET /users.groups
  Params: ids[] (ARRAY, requerido — formato PHP array)
  Response: [{ id, username, email, groups[], companies[], helpdesks[], locations[], ... }]
```

### Integraciones

#### 2-A. Cruzar usuarios InvGate vs MDA
- **Propósito:** Detectar usuarios que existen en InvGate pero no están dados de alta en el MDA, y viceversa.
- **API:** `GET /users` todos los usuarios, luego cruzar contra `users` (auth local) o `agents` (operadores).
- **Qué habilita:**
  - Vista admin con tabla comparativa (usuario InvGate ↔ usuario MDA)
  - Botón "Copiar para ticket GDI" que genera un texto formateado con los datos del usuario faltante (username, email, rol) listo para pegar en un ticket de GDI
  - Reporte de usuarios MDA sin correlato en InvGate (posibles cuentas obsoletas)

#### 2-B. Buscador de usuarios extendido
- **Propósito:** El buscador actual (`/usuarios`, existe en nav) busca en DB local. Extenderlo para también buscar en InvGate.
- **API:** `GET /users.by?email=X`, `GET /users.by?username=X`, `GET /user?id=X`
- **Qué habilita:**
  - Búsqueda unificada: primero DB local, si no encuentra, busca en InvGate
  - Ver datos de contacto, grupos y ubicación del usuario InvGate
  - Navegar del usuario InvGate a sus tickets abiertos

#### 2-C. Grupos de usuarios
- **Propósito:** Ver a qué grupos, compañías, helpdesks y ubicaciones pertenece un usuario.
- **API:** `GET /users.groups?ids[]=X`
- **Qué habilita:**
  - En el perfil de usuario, mostrar su pertenencia a grupos/mesas
  - Útil para validar si un usuario tiene acceso a las mesas correctas

---

## 3. Incidents (Tickets)

### Recurso API
```
GET /incident?id=X
  Params: id, comments, date_format, decoded_special_characters
  Response: InvgateIncident (object)

GET /incidents?ids[]=X&ids[]=Y
  Params: ids[] (ARRAY — formato PHP array), comments, date_format
  Response: { "id": { inc }, ... }  (diccionario keyed por ID)

GET /incidents.by.status?status_id=X
  Params: status_id, status_ids[], limit, offset
  Response: { status, info, requestIds[], limit, offset, total }

GET /incidents.by.agent?id=X
  Params: id (o username, o email), limit, page_key, comments
  Response: { status, info, requests: { id: { inc } }, next_page_key }

GET /incidents.by.customer?id=X
  Misma forma que by.agent

GET /incidents.by.helpdesk?helpdesk_id=X
  Params: helpdesk_id (requerido — NOTA: es helpdesk_id, NO id), limit, page_key
  Response: { status, info, requestIds[], limit, offset, total }

GET /incidents.last.hour
  Params: limit, page_key
  Response: { data: [ InvgateIncident ], next_page_key }

GET /incidents.details.by.view?view_id=X
  Params: view_id, page_key, sort_by, order_by
  Response: { data: [ InvgateIncident ], next_page_key, metadata }
```

### Integraciones

#### 3-A. Dashboard de carga de agentes
- **Propósito:** Mostrar en el panel admin cuántos tickets abiertos tiene cada agente.
- **API:** `GET /incidents.by.agent?id=X` por cada agente relevante, o usar vista personalizada.
- **Qué habilita:**
  - Card en SyncDashboard con "Tickets abiertos: N" (reemplazar el simple "Conectado/Desconectado")
  - Tabla de agentes con su carga actual de tickets
  - Alerta si un agente supera X tickets abiertos

#### 3-B. Tickets de un cliente/usuario específico
- **Propósito:** Desde el perfil de un usuario (o buscador de usuarios), ver sus tickets abiertos.
- **API:** `GET /incidents.by.customer?email=X&limit=20`
- **Qué habilita:**
  - Botón "Ver tickets" en el resultado de búsqueda de usuario
  - Lista de incidentes del usuario con ID, título, estado, prioridad

#### 3-C. Filtro por estado (vista rápida)
- **Propósito:** Listar incidentes por estado (solo IDs o detalles según necesidad).
- **API:** `GET /incidents.by.status?status_id=N` con paginación offset.
- **Qué habilita:**
  - Vista con pestañas: Nuevos / Abiertos / Pendientes / Solucionados / Cerrados
  - Conteo por estado en el dashboard

#### 3-D. Actividad reciente
- **Propósito:** Mostrar en home del MDA los tickets creados en la última hora.
- **API:** `incidents.last.hour`
- **Qué habilita:**
  - Widget "Actividad reciente" con últimos tickets creados
  - Actualización periódica

#### 3-E. Vista personalizada desde InvGate
- **Propósito:** Traer una vista guardada de InvGate (con filtros, columnas, orden) al MDA.
- **API:** `GET /incidents.details.by.view?view_id=X`
- **Qué habilita:**
  - Réplica de una vista InvGate dentro del MDA
  - Útil para supervisores que quieren ver su cola sin entrar a InvGate

#### 3-F. PUENTE: Ticket detail viewer (comentarios, tareas, notas)
- Ver sección **4. Incident Sub-recursos**.

---

## 4. Incident Sub-recursos

### Recurso API
```
GET /incident.comment?request_id=X
  Response: [{ id, incident_id, author_id, message, created_at, customer_visible, is_solution, attached_files }]

GET /incident.tasks?request_id=X
  Response: [{ task_id, name, description, status, agent_id, helpdesk_id, completed_at, created_at, expiration_date }]

GET /internalnotes?id=X
  NOTA: usa id= (ID del incidente), NO request_id=
  Response: [{ /* internal note */ }]

GET /incident.link?request_id=X
  Response: [{ id, title }]

GET /incident.observer?request_id=X
  Response: [ user_id, user_id, ... ]

GET /incident.attachment?id=X&md5=HASH
  Response: { filename, md5, file_size, content_type, base64 }

GET /incident.timetracking?request_id=X
  Ver sección 10.
```

### Integraciones

#### 4-A. Visor de detalle de ticket (PUENTE)
- **Propósito:** Desde un incidente ID, poder ver toda su información asociada en una sola vista.
- **API:** `GET /incident?id=X` (detalle) + `comment`, `tasks`, `internalnotes`, `link`, `observer`
- **Qué habilita:**
  - Página `/admin/tickets/[id]` con:
    - Datos del incidente (título, estado, prioridad, agente asignado, cliente)
    - Timeline de comentarios (con autor y fecha)
    - Tareas asociadas (con estado completado/pendiente)
    - Notas internas
    - Enlaces a otros tickets
    - Observadores
    - Archivos adjuntos (descargables via base64)
  - Navegación: desde cualquier vista de tickets → click → detalle completo

#### 4-B. Adjuntos descargables
- **Propósito:** Poder ver/bajar archivos adjuntos de un ticket sin entrar a InvGate.
- **API:** `GET /incident.attachment?id=X&md5=HASH`
- **Qué habilita:**
  - Lista de attached_files en el visor de ticket
  - Link de descarga que pasa por proxy MDA → InvGate
  - Vista previa inline para imágenes

---

## 5. Categorías

### Recurso API
```
GET /categories
  Params: id, page, page_size (default 20, max 500), search
  Response: [{ id, name, parent_category_id }]
```

### Integraciones

#### 5-A. Navegador de categorías (admin)
- **Propósito:** Explorar el árbol de categorías de InvGate desde el MDA.
- **API:** `GET /categories` (con paginación offset, hasta 500 por página)
- **Qué habilita:**
  - Vista admin que lista todas las categorías con su `parent_category_id`
  - Posibilidad de armar un tree visual (children por `parent_category_id`)
  - Búsqueda por nombre

#### 5-B. Selector de categoría para títulos
- **Propósito:** En la vista admin de títulos (ver sección 8), poder asignar una categoría InvGate a cada título.
- **API:** `GET /categories` → poblar un `<select>` en el formulario de título
- **Qué habilita:**
  - Asociar `title.category_id` → `categories.id`
  - Al crear un ticket desde un título, se preselecciona la categoría

---

## 6. Atributos de Incidente (Lookup Tables)

### Recurso API
```
GET /incident.attributes.status        → [{ id, name }]  (1=Nuevo...8=Cancelado)
GET /incident.attributes.priority      → [{ id, name }]  (1=Baja...5=Crítica)
GET /incident.attributes.type           → [{ id, name }]  (1=Incidente...6=Incidente mayor)
GET /incident.attributes.source         → [{ id, name }]  (1=Correo...14=MCP)
```

### Integraciones

#### 6-A. Dropdowns dinámicos en formularios
- **Propósito:** Poblar selects de estado, prioridad, tipo y fuente desde la API (en lugar de hardcodear los mappings).
- **API:** Endpoints de atributos (todos testeados ✅)
- **Qué habilita:**
  - Formularios que usan los valores actualizados de InvGate
  - Filtros en vistas de tickets (ej: filtrar por prioridad Alta/Urgente/Crítica)
  - Los mappings ya están documentados en `endpoints-reference.md`

---

## 7. Knowledge Base

### Recurso API
```
GET /kb.articles
  Params: id, page, page_size, category_id, status_id
  Response: { status, data: [{ id, title, content, category_id, author_id, ... }] }

GET /kb.articles.by.keywords
  Params: keywords (STRING, requerido), page, page_size

GET /kb.articles.by.category
  Params: category_id (requerido), page, page_size

GET /kb.articles.by.ids
  Params: ids[] (ARRAY — PHP array format)

GET /kb.categories
  Params: id (INTEGER)

GET /kb.categories.by.ids
  Params: ids[] (ARRAY)

GET /kb.articles.attachments
  Params: article_id (requerido)
```

### Integraciones

#### 7-A. Búsqueda KB desde command palette (Ctrl+K)
- **Propósito:** Que el usuario pueda presionar Ctrl+K y buscar artículos de la base de conocimientos por palabras clave.
- **API:** `GET /kb.articles.by.keywords?keywords=...&page_size=5`
- **Qué habilita:**
  - Resultados de KB mezclados con resultados de navegación en el command palette
  - Cada resultado muestra título + categoría
  - Al seleccionar, abre el artículo en una vista del MDA (o en InvGate)

#### 7-B. Visor de artículos KB
- **Propósito:** Leer el contenido completo de un artículo KB dentro del MDA.
- **API:** `GET /kb.articles?id=X` (article individual) o `GET /kb.articles.by.ids?ids[]=X`
- **Qué habilita:**
  - Página `/kb/[id]` que renderiza título + contenido del artículo
  - Navegación artículos relacionados por categoría
  - Visualización de attachments del artículo

#### 7-C. Admin de títulos con asignación KB (ver sección 8)

---

## 8. Títulos (Integración Cruzada)

### Recurso API relevante
```
GET /kb.articles          → listar artículos KB
GET /kb.articles.by.keywords → buscar artículo para asignar
GET /categories           → listar categorías para asignar
GET /incident.attributes.type → tipos de ticket
```

### Integración

#### 8-A. Admin CRUD de títulos (ya existe frontend, migrar a DB)
- **Propósito:** Reemplazar (o complementar) la fuente Google Sheets de títulos con una tabla SQLite + asignación a KB article y categoría InvGate.
- **Estado actual:** Los títulos se cargan desde Google Sheets via API de Google Visualization. El `TitleDrawer` ya muestra un link al artículo KB #226.
- **Qué habilita:**
  - Admin CRUD: crear, editar, eliminar títulos desde el panel admin
  - Campo `kb_article_id` → seleccionar artículo KB desde InvGate (búsqueda por keywords)
  - Campo `category_id` → seleccionar categoría InvGate
  - Campo `type_id` → tipo de ticket por defecto
  - Sincronización: batch de títulos → artículos KB (¿crear artículo KB desde un título?)
- **Notas:** Esta integración requiere:
  1. Crear tabla `titles` en SQLite
  2. Endpoint proxy `/api/invgate/kb-search.ts` para buscar artículos
  3. Endpoint proxy `/api/invgate/categories.ts` (ya se puede usar el existente si se adapta)
  4. Migrar datos actuales de Google Sheets a la DB

---

## 9. Ubicaciones (Locations)

### Recurso API
```
GET /locations
  Response: [{ id, name, parent_id, total }]

GET /locations.observers?id=X
GET /locations.users?id=X
```

### Integraciones

#### 9-A. Cruzar ubicaciones InvGate con oficinas MDA
- **Propósito:** Comparar las ubicaciones dadas de alta en InvGate con las oficinas registradas en la tabla `offices` del MDA para validar datos geográficos.
- **API:** `GET /locations`
- **Qué habilita:**
  - Vista admin con tabla comparativa: ubicación InvGate ↔ oficina MDA
  - Flag de coincidencia exacta / parcial / sin match
  - Detección de ubicaciones InvGate sin oficina MDA (y viceversa)
  - Botón para copiar datos de ubicación faltante
- **Notas:** El matching puede ser por nombre (`locations.name` ↔ `offices.name`), código o manual. Las oficinas tienen `locality`, `provinceCode`, `address` para comparación más precisa.

---

## 10. Time Tracking

### Recurso API
```
GET /timetracking?request_id=X
  Response: [{ timetracking_id, user_id, incident, from, to, total, comment, status, timetracking_category_id }]

GET /timetracking.attributes.category
  Params: id
  Response: [{ id, name, parent_id, cost_per_hour }]
```

### Integraciones

#### 10-A. Horas cargadas por ticket
- **Propósito:** En el visor de detalle de ticket (4-A), mostrar las horas cargadas.
- **API:** `GET /timetracking?request_id=X`
- **Qué habilita:**
  - Sección "Tiempos" en el detalle del ticket
  - Total de horas por ticket
  - Detalle: quién cargó, cuándo, categoría, comentario

---

## 11. CI (Configuration Items)

### Recurso API
```
GET /cis.by.id
  Params: ids[] (ARRAY — PHP array format), type (STRING — filter by CI type)
```

### Integraciones

#### 11-A. Vincular assets (terminales) con CIs de InvGate
- **Propósito:** Relacionar la tabla `terminals` del MDA con CIs de InvGate.
- **API:** `GET /cis.by.id?ids[]=X`
- **Qué habilita:**
  - En el detalle de una terminal, ver su CI asociado en InvGate
  - Tickets relacionados a ese CI (via `incidents.by.cis`)

---

## 12. Empresas / Grupos / Niveles

### Recurso API
```
GET /companies        → [{ id, name }] (vacío si no hay companies configuradas)
GET /groups           → [{ id, name, total }]
GET /groups.observers?id=X
GET /groups.users?id=X
GET /levels           → [{ id, type_id, status_id, level_order, parent_id, engine_id, members_ids[], total_members }]
GET /levels.observers?id=X
```

### Integraciones

#### 12-A. Estructura organizacional
- **Propósito:** Visualizar la estructura de grupos, niveles y compañías desde InvGate.
- **API:** `GET /groups`, `GET /levels`
- **Qué habilita:**
  - Vista admin de la org de InvGate
  - Útil para diagnosticar problemas de asignación de tickets
  - Ver miembros de cada nivel/grupo

---

## 13. Breaking News

### Recurso API
```
GET /breakingnews?id=X
GET /breakingnews.all
  Params: date_format
  Response: array de breaking news

GET /breakingnews.attributes.status
GET /breakingnews.attributes.type
```

### Integraciones

#### 13-A. Alertas en el home del MDA
- **Propósito:** Mostrar las breaking news activas de InvGate como alertas/banners en el MDA.
- **API:** `GET /breakingnews.all`
- **Qué habilita:**
  - Banner informativo en home (ej: "⚠️ Corte programado 01/07")
  - Vista de historial de breaking news
  - Filtro por tipo/estado

---

## 14. Custom Fields

### Recurso API
```
GET /cf.fields.all                          → todas las definiciones de CF
GET /cf.fields.by.category?id=X            → CFs de una categoría
GET /cf.fields.shared.all                  → CFs compartidos
GET /cf.fields.types                       → tipos de CF
GET /cf.field.options.list?uid=X          → opciones de CF tipo lista
GET /cf.field.options.tree?uid=X          → estructura de CF tipo árbol
```

### Integraciones

#### 14-A. Campos personalizados por categoría
- **Propósito:** Saber qué campos adicionales requiere un ticket según su categoría.
- **API:** `GET /cf.fields.by.category?id=X`
- **Qué habilita:**
- En el admin de categorías, ver qué CFs aplican
- Guía para saber qué datos se necesitan al crear un ticket de cierta categoría

---

## 15. System

### Recurso API
```
GET /sd.version
  Response: { "version": "v8.15.13" }
```

### Integraciones

#### 15-A. Health check / SyncDashboard
- **Propósito:** Verificar conectividad con InvGate.
- **Estado actual:** ✅ Ya implementado en `src/pages/api/admin/invgate-status.ts` y consumido por `SyncDashboard.astro`.
- **API:** `GET /sd.version` (cambiado de `incidents?page=1&page_size=1` que daba 428)
- **Qué habilita:**
  - Indicador "Conectado/Desconectado" con versión de InvGate
  - Tiempo de respuesta del endpoint
  - Base para cualquier health check periódico

---

## Resumen de Priorización

| Prioridad | Integración | Recurso | Esfuerzo | Impacto |
|-----------|------------|---------|----------|---------|
| P0 | Health check SyncDashboard | System | ✅ Hecho | Alto |
| P1 | Visor de detalle de ticket | Incident + sub-recursos | Medio | Alto |
| P1 | Búsqueda KB en Ctrl+K | KB articles | Bajo | Alto |
| P1 | Admin CRUD de títulos + KB | Títulos + KB + Categories | Alto | Alto |
| P2 | Cruzar usuarios InvGate vs MDA | Users | Medio | Alto |
| P2 | Sincronizar helpdesks con guía | Helpdesks | Bajo | Medio |
| P2 | Dashboard de carga de agentes | Incidents by.agent | Bajo | Medio |
| P2 | Cruzar ubicaciones vs oficinas | Locations | Bajo | Medio |
| P3 | Dropdowns dinámicos de atributos | Incident attributes | Bajo | Bajo |
| P3 | Visor de artículos KB | KB articles | Medio | Medio |
| P3 | Actividad reciente (última hora) | Incidents last.hour | Bajo | Medio |
| P3 | Horas cargadas por ticket | Time tracking | Bajo | Bajo |
| P4 | Breaking news en home | Breaking news | Bajo | Bajo |
| P4 | Vincular terminales con CIs | CIS | Medio | Bajo |
| P4 | Estructura organizacional | Groups/Levels | Bajo | Bajo |
| P4 | Campos personalizados por categoría | Custom Fields | Medio | Bajo |

---

## Notas Técnicas Transversales

1. **Endpoints proxy:** Cada integración que consuma API InvGate desde el frontend necesita un endpoint Astro SSR (`/api/invgate/*`) que evite exponer la API key al cliente.

2. **Caché:** Para endpoints que no cambian frecuentemente (atributos, helpdesks, categorías), considerar cachear la respuesta por N minutos para reducir latencia y calls a InvGate.

3. **Paginación:** Recordar los dos modelos:
   - Offset: `page`/`page_size` (categories, by.status, kb.articles)
   - Keyset: `limit`/`page_key`/`next_page_key` (by.agent, by.customer, by.helpdesk)

4. **PHP array format:** Endpoints con `ids[]` requieren `?ids[]=1&ids[]=2`, NO `?ids=1,2`. Esto aplica a `/incidents`, `/users.groups`, `/kb.articles.by.ids`, etc.

5. **Solo abiertos:** Los endpoints `by.agent`, `by.customer`, `by.helpdesk`, `by.status` solo devuelven requests abiertos (no cerrados/completados).

6. **Tasa de llamadas:** InvGate no documenta rate limits explícitos, pero se recomienda no exceder ~10 req/s para evitar degradación.
