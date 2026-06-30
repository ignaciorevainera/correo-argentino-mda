# InvGate API v1 — GET Endpoints Reference

**Base:** `INVGATE_BASE_URL/api/v1/` (`https://correoargentino.sd.cloud.invgate.net/api/v1/`)

**Auth:** Basic `portalmda:API_KEY` (base64). Handled by `invgateGet<T>(endpoint)`.

**Common params:** `date_format` = `"epoch"` (default) or `"iso8601"`.

**IMPORTANT:** The official InvGate documentation often differs from the actual API responses. This file documents **tested behavior** against the Correo Argentino instance.

---

## Connectivity

### `GET /sd.version`

**Params:** none

**Response:** `{ "version": "v8.15.13" }`

---

## Helpdesks

### `GET /helpdesks`

Returns active helpdesks.

**Params:** `id` (INTEGER), `name` (STRING), `include_deleted` (BOOLEAN)

**Response:** Array of:
- `id` (INTEGER)
- `name` (STRING)
- `parent_id` (INTEGER)
- `status_id` (INTEGER)
- `engine_id` (INTEGER)
- `total_members` (INTEGER)

### `GET /helpdesks.observers`
**Params:** `ids` (ARRAY, optional)

### `GET /helpdesksandlevels`
**Params:** `page`, `page_size`, `ids` (ARRAY)

---

## Incidents — by ID

### `GET /incident`

Returns a single request's full details.

**Params:** `id` (INTEGER, **required**), `comments` (BOOLEAN), `date_format` (STRING), `decoded_special_characters` (BOOLEAN)

**Response:** Single `InvgateIncident` object.

### `GET /incidents`

Returns full objects for specific request IDs. **Does NOT support pagination.**

**Params:**
- `ids[]` (ARRAY, **required** — PHP array format: `?ids[]=309&ids[]=360`)
- `comments` (BOOLEAN)
- `date_format` (STRING)

**Response:** Dictionary keyed by ID:
```json
{
  "309": { /* InvgateIncident */ },
  "360": { /* InvgateIncident */ }
}
```

**Important:** Pass array params as `?ids[]=value1&ids[]=value2`. Comma-separated (`?ids=309,360`) returns 428 with `"tipo string pasado es inválido"`.

---

## Incidents — by Status / View (IDs only, offset page)

### `GET /incidents.by.status`

Lists request IDs matching a status. **Open requests only. IDs only, not full objects.** Offset-paginated.

**Params:** `status_id` (INTEGER), `status_ids[]` (ARRAY — PHP array format), `limit` (INTEGER), `offset` (INTEGER)

**Response:**
```json
{
  "status": "OK",
  "info": "Returned a list of the requests related to the given status.",
  "requestIds": [309, 360, ...],
  "limit": null,
  "offset": 0,
  "total": 1450
}
```

### `GET /incidents.by.view`

Lists request IDs from a view. **IDs only, offset-paginated.**

**Params:** `view_id` (INTEGER, **required**), `limit` (INTEGER), `offset` (INTEGER)

**Response:** Same shape as `by.status`.

---

## Incidents — by Entity (full objects, keyset page, open only)

These endpoints all return **open requests only**. They use keyset-based pagination.

### `GET /incidents.by.agent`

**Params:** `id` (INTEGER) **or** `username` (STRING) **or** `email` (STRING), `limit` (INTEGER), `page_key` (STRING — omit for page 1), `comments` (BOOLEAN)

**Response:**
```json
{
  "status": "OK",
  "info": "Returned a list of the requests related to the given agent.",
  "requests": {
    "306": { /* InvgateIncident */ },
    "309": { /* InvgateIncident */ }
  },
  "next_page_key": "eyJsYXN0X2lkIjozMDZ9"
}
```
`requests` is a **dictionary keyed by incident ID**, not an array. Access with `Object.values(result.requests)` to get an array.

### `GET /incidents.by.customer`

Same params and response shape as `by.agent`.

**Params:** `id` (INTEGER) **or** `username` (STRING) **or** `email` (STRING), `limit` (INTEGER), `page_key` (STRING)

**Response:** Same as `by.agent` — `{status, info, requests: {id: object}, next_page_key}`

### `GET /incidents.by.helpdesk`

**IMPORTANT:** Parameter is `helpdesk_id=`, NOT `id=`. Passing `?id=X` returns error.

**Params:** `helpdesk_id` (INTEGER, **required**), `limit` (INTEGER), `page_key` (STRING)

**Response:** IDs only, same shape as `by.status`:
```json
{
  "status": "OK",
  "info": "...",
  "requestIds": [309, 360, ...],
  "limit": null,
  "offset": 0,
  "total": 0
}
```

### `GET /incidents.last.hour`

Lists requests created in the last hour. Keyset-paginated.

**Params:** `limit` (INTEGER), `page_key` (STRING)

**Response:**
```json
{
  "data": [ /* InvgateIncident objects */ ],
  "next_page_key": null
}
```
Note: wrapped in `data` key, NOT a flat array.

### `GET /incidents.details.by.view`

Returns full incident objects from a saved view, including metadata (column labels). Keyset-paginated.

**Params:** `view_id` (INTEGER, **required**), `page_key` (STRING), `sort_by` (STRING — `"id"` or `"last_update"`), `order_by` (STRING — `"asc"` or `"desc"`)

**Response:**
```json
{
  "data": [ /* InvgateIncident */ ],
  "next_page_key": null,
  "metadata": [ /* column labels */ ]
}
```

---

## Incidents — by CI / Sentiment

### `GET /incidents.by.cis`
**Params:** `cis_source_id` (INTEGER, **required**), `ci_ids[]` (ARRAY, **required**), `group` (STRING, **required** — `"asset"`, `"business_application"`, `"cloud_asset"`, `"database"`)
**Response:** Array of `{ ci_id, requests[] }`

### `GET /incidents.by.sentiment`
**Params:** `sentiment_ids[]` (ARRAY)
**Response:** `{status, info, requestIds[]}` — ERROR if no sentiment_ids provided.

---

## Incident Sub-resources

**IMPORTANT parameter convention:** Some sub-resources use `request_id`, others use `id`. Verified by testing:

| Endpoint | Correct param | Notes |
|---|---|---|
| `incident.comment` | `request_id=` | Returns array of comments |
| `incident.tasks` | `request_id=` | Returns array of tasks |
| `incident.link` | `request_id=` | Returns `[{id, title}]` |
| `incident.observer` | `request_id=` | Returns flat array of user IDs |
| `incident.collaborator` | `request_id=` (assumed, untested) | |
| `internalnotes` | `id=` | Same pattern as `/incident?id=X` |

### `GET /incident.comment`

**Params:** `request_id` (INTEGER, **required**), `date_format` (STRING)

**Response:** Array of:
- `id` (INTEGER) — comment ID
- `incident_id` (INTEGER)
- `author_id` (INTEGER)
- `message` (STRING — may contain HTML)
- `created_at` (INTEGER — epoch)
- `customer_visible` (BOOLEAN)
- `is_solution` (BOOLEAN)
- `msg_num` (INTEGER)
- `reference` (STRING or null)
- `attached_files` (ARRAY)

### `GET /incident.tasks`

**Params:** `request_id` (INTEGER, **required**), `date_format` (STRING)

**Response:** Array of:
- `task_id` (INTEGER)
- `name` (STRING)
- `description` (STRING or null)
- `status` (INTEGER — 1=completed)
- `agent_id` (INTEGER)
- `helpdesk_id` (INTEGER or null)
- `is_predefined` (BOOLEAN)
- `is_required` (BOOLEAN)
- `completed_at` (INTEGER or null — epoch)
- `created_at` (INTEGER — epoch)
- `linked_request_id` (INTEGER)
- `expiration_date` (INTEGER or null)

### `GET /incident.link`

**Params:** `request_id` (INTEGER, **required**)

**Response:** Array of `{ id: INTEGER, title: STRING }`

### `GET /incident.observer`

**Params:** `request_id` (INTEGER, **required**)

**Response:** Flat array of user IDs: `[25, 49, 76, 188, ...]`

### `GET /incident.collaborator`
**Params:** `request_id` (INTEGER, **required** — assumed, untested)

### `GET /internalnotes`

**Params:** `id` (INTEGER, **required** — incident ID, same as `/incident?id=X`), `date_format` (STRING)

**Response:** Array of internal note objects.

### `GET /incident.attachment`
**Params:** `id` (INTEGER, **required** — request ID), `md5` (STRING, **required** — attachment md5 hash)
**Response:** `{ filename, md5, file_size, content_type, base64 }`

### `GET /incident.approval.*`
All approval endpoints require `id` (INTEGER, **required** — request ID).

| Endpoint | Response |
|---|---|
| `incident.approval.status` | `{ status_id }` |
| `incident.approval.type` | `{ type_id }` |
| `incident.approval.vote_status` | `{ vote_status_id }` |
| `incident.approval.possible_voters` | Array of possible voters |
| `incident.approval.add_voter` | POST only |
| `incident.approval.accept`/`cancel`/`reject` | PUT only |

### `GET /incident.linked_cis.counters.from`
**Params:** `id` (INTEGER, **required** — request ID)

### `GET /incident.tasks`
**Params:** `request_id` (INTEGER, **required**)

### `GET /incident.custom_field`
**Params:** `id` (INTEGER, **required** — request ID)
**Note:** POST, PATCH, DELETE only for modifications.

### `GET /incident.external_entity`
**Params:** `id` (INTEGER, **required** — request ID)

---

## Incident Attributes (lookup tables)

All return array of `{id, name}`. Tested values:

| Endpoint | Values |
|---|---|
| `incident.attributes.priority` | 1=Baja, 2=Media, 3=Alta, 4=Urgente, 5=Crítica |
| `incident.attributes.status` | 1=Nuevo, 2=Abierto, 3=Pendiente, 4=En espera, 5=Solucionado, 6=Cerrado, 7=Rechazado, 8=Cancelado |
| `incident.attributes.type` | 1=Incidente, 2=Pedido de servicio, 3=Pregunta, 4=Problema, 5=Pedido de cambio, 6=Incidente mayor |
| `incident.attributes.source` | 1=Correo, 2=Web, 3=Teléfono, 4=En persona, 5=IM, 6=Programado, 7=Importado, 8=API, 9=MS Teams, 10=WhatsApp, 11=Workflow, 12=Chat Integrado, 13=App Móvil, 14=MCP |

**Params:** `id` (INTEGER, optional — filter by ID)

---

## Categories

### `GET /categories`

**Params:** `id` (INTEGER), `page` (INTEGER), `page_size` (INTEGER, default 20, max 500), `search` (STRING)

**Response:** Flat array of `{ id, name, parent_category_id }`. ✅ Verified.

---

## Custom Fields

| Endpoint | Params | Notes |
|---|---|---|
| `cf.fields.all` | — | All CF definitions |
| `cf.fields.by.category` | `id` (INTEGER, **required**) | CFs for a category |
| `cf.fields.shared.all` | — | Shared CFs |
| `cf.fields.types` | — | CF types |
| `cf.field.options.list` | `uid` (INTEGER, **required**) | List-type CF options |
| `cf.field.options.list.config` | `uid` (INTEGER, **required**) | List CF configs |
| `cf.field.options.tree` | `uid` (INTEGER, **required**) | Tree-type CF structure |

---

## Users

### `GET /user`

**Params:** `id` (INTEGER, **required**), `include_disabled` (BOOLEAN)

**Response:** `InvgateUser` object. ✅ Verified with user 2630.

### `GET /users`

Lists all users.

**Params:** `ids[]` (ARRAY, optional), `include_disabled` (BOOLEAN)

**Response:** Flat array of `InvgateUser`. ✅ Verified.

### `GET /users.by`

Searches users by email, username, or phone. Keyset-paginated (10 per page).

**Params:** Any search field: `username`, `email`, `phone`, `mobile_phone`, `office_phone`, `other_phone`, `fax_phone`, `employee_number`. Plus: `exact_match` (BOOLEAN), `include_disabled` (BOOLEAN), `page_key` (STRING)

**Tested:** `?email=emlemos@correoargentino.com.ar` → 200 ✅

**Response:**
```json
{
  "data": {
    "2630": { /* InvgateUser */ },
    "2631": { /* InvgateUser */ }
  },
  "next_page_key": null
}
```
**Note:** `data` is a **dictionary keyed by user ID**, NOT an array. Access via `Object.values(result.data)`.

### `GET /users.groups`

**Params:** `ids[]` (ARRAY, **required** — PHP array format)

**Response:** Array of `{ id, username, email, groups[], companies[], helpdesks[], locations[], ...observed[] }`

---

## Companies / Groups / Locations / Levels

### `GET /companies`
**Response:** Flat array. ✅ Returns `[]` (no companies configured).

### `GET /groups`
**Response:** Flat array of `{ id, name, total }`. ✅ Verified.
**Note:** Fields differ from documentation (`total` not `parent_id`/`status_id`).

### `GET /groups.observers` / `GET /groups.users`
**Params:** `id` (INTEGER, **required**)

### `GET /locations`
**Response:** Flat array of `{ id, name, parent_id, total }`. ✅ Verified.

### `GET /locations.observers` / `GET /locations.users`
**Params:** `id` (INTEGER, **required**)

### `GET /levels`
**Response:** Array of `{ id, type_id, status_id, level_order, parent_id, engine_id, members_ids[], total_members }`. ✅ Verified.

### `GET /levels.observers`
**Params:** `id` (INTEGER, **required**)

---

## Time Tracking

### `GET /timetracking`

**Params:** `request_id` (INTEGER — if filtering by request) **or** `from` (STRING, ISO-8601) / `to` (STRING, ISO-8601), `date_format` (STRING)

**Tested:** `?request_id=309` → 200 ✅ (empty array, no time logged)

**Response:** Array of `{ timetracking_id, user_id, incident, from, to, total, comment, status, timetracking_category_id }`

### `GET /timetracking.attributes.category`
**Params:** `id` (INTEGER)
**Response:** Array of `{ id, name, parent_id, cost_per_hour }`

---

## Knowledge Base

### `GET /kb.articles`

**Params:** `id` (INTEGER), `page` (INTEGER), `page_size` (INTEGER, default 20), `category_id` (INTEGER), `status_id` (INTEGER)

**Tested:** `?page=1&page_size=2` → 200 ✅

**Response:**
```json
{
  "status": "OK",
  "data": [
    { "id": 2, "title": "...", "content": "...", "category_id": 1, "author_id": 4, ... }
  ]
}
```
**Note:** Wrapped in `{status, data}`, NOT a flat array.

### `GET /kb.articles.by.category`
**Params:** `category_id` (INTEGER, **required**), `page` (INTEGER), `page_size` (INTEGER)

### `GET /kb.articles.by.ids`
**Params:** `ids[]` (ARRAY, **required** — PHP array format)

### `GET /kb.articles.by.keywords`
**Params:** `keywords` (STRING, **required**), `page` (INTEGER), `page_size` (INTEGER)

### `GET /kb.categories`
**Params:** `id` (INTEGER)

### `GET /kb.categories.by.ids`
**Params:** `ids[]` (ARRAY, **required**)

### `GET /kb.articles.attachments`
**Params:** `article_id` (INTEGER, **required**)

---

## Data Export

### `GET /data.export`
**Params:** `type` (STRING, **required** — entity type), `format` (STRING — `"csv"` or `"json"`)
**Tested:** `?type=request` → 428. May require additional setup or permissions.

---

## Triggers

### `GET /triggers`
**Params:** `trigger_id` (INTEGER)
**Response:** Array of `{ id, trigger_name }`

### `GET /triggers.executions`
**Params:** `trigger_id` (INTEGER)
**Response:** Array of `{ id, trigger_id, request_id, executed_at }`

---

## Workflows

### `GET /wf.initialfields.by.category`
**Params:** `category_id` (INTEGER, **required**)
**Response:** `{ category_id, associated_workflow_id, associated_workflow_name, workflow_initial_fields[] }`

---

## CI (Configuration Items)

### `GET /cis.by.id`
**Params:** `ids[]` (ARRAY, **required** — PHP array format), `type` (STRING — filter by CI type)

---

## Breaking News

| Endpoint | Params |
|---|---|
| `breakingnews` | `id` (req), `date_format` |
| `breakingnews.all` | `date_format` |
| `breakingnews.attributes.status` | `id` |
| `breakingnews.attributes.type` | `id` |
| `breakingnews.status` | `id` (req), `date_format` |
