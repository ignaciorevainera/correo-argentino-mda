---
name: wise-cx-api
description: Use when integrating or querying the Wise CX API for cases, calls, queues, or agent management.
---

# Wise CX API

## Overview
Wise CX API reference for managing case routing, agent presence, calls, and email activities. 75 REST endpoints across 21 resource groups.

## Formato y Autenticacion
- **Base URL:** `https://api.wcx.cloud`
- **Rate Limit:** 5000 requests/min, 150000 requests/day.
- **Autenticacion (GET /core/v1/authenticate):**
  - Query param `user` (required) + header `x-api-key` (required).
  - Returns JWT valid for 3600s.
  - Subsequent requests: header `Authorization: Bearer <Token>`.
- **x-api-key MUST be sent on ALL requests**, not just /authenticate. Omitting it returns `403 Forbidden`.

### API Key Generation
1. Settings -> Canales -> Api in Wise CX dashboard.
2. Register a username (`user`).
3. Click "Generar" to get the `x-api-key`.

### Parametros Comunes
- `fields` — columnas a devolver (comma-separated). Si se omite, solo campos por defecto.
- `filtering` — filtro avanzado: `[{'field':'col','operator':'EQUAL','value':'x'}]`. Operadores: IN, NOT IN, EQUAL, NOT EQUAL, GREATER, LOWER, GREATER EQUAL, LOWER EQUAL, CONTAINS.
- `sort` + `sort_field` — ordenamiento (default: asc).
- `page` + `limit` — paginacion offset-based (max/defecto: 100).

---

## Endpoint Reference (75 endpoints)

### 1. Autenticacion
| Method | Path | Description |
|--------|------|-------------|
| **GET** | `/core/v1/authenticate` | Obtener JWT. Query: `user` (required). Header: `x-api-key`. |

### 2. Casos (Cases)
| Method | Path | Body |
|--------|------|------|
| **POST** | `/core/v1/cases` | `group_id`*, `source_channel`* (phone/email), `subject`*, `user_id`, `tags`, `type_id`, `priority`, `due_at`, `custom_fields[]`, `activities[]` |
| **PUT** | `/core/v1/cases/{{id}}` | Same fields as POST (all optional). Also: `status`, `spam`, `deleted` |
| **GET** | `/core/v1/cases` | — (ultimos 3 meses) |
| **GET** | `/core/v1/cases/{{id}}` | — |
| **DELETE** | `/core/v1/cases/{{id}}` | — |
| **PUT** | `/core/v1/cases/{{id}}/transfer` | `{"group_id": 1234, "user_id": 5678}` |
| **PUT** | `/core/v1/cases/{{id}}/status` | `{"status": "solved"}` (open/solved/pending/hold/closed) |
| **GET** | `/core/v1/cases/{{id}}/activities` | — |
| **GET** | `/core/v1/cases/{{id}}/activities/{{activity_id}}` | — |
| **POST** | `/core/v1/cases/{{id}}/summarize` | AI summary. No body. |

**Fields (cases):** `id, number, group_id, user_id, contact_id, status, source_channel, tags, type_id, subject, priority, due_at, custom_fields, created_at, solved_at, closed_at, last_read, last_update, first_read, sla_result, channel_account, bot_resolved, bot_attended, summary`

**Fields (activities):** `id, case_id, type, user_id, channel, content, contact_from, contacts_to, attachments, recordings, created_at, sending_status`

**Filter operators (activities):** `type` -> IN/NOT IN/EQUAL/NOT EQUAL. `created_at, id` -> todos los operadores.

### 3. Casos / Tipos
| Method | Path |
|--------|------|
| **GET** | `/core/v1/cases/types` |
| **GET** | `/core/v1/types` (same) |

**Fields:** `id, name, parent_id`. Filter: `id, name, parent_id` -> IN, EQUAL.

### 4. Casos / Etiquetas
| Method | Path |
|--------|------|
| **GET** | `/core/v1/cases/tags` |

**Fields:** `id, name`.

### 5. Casos / Custom Fields Options
| Method | Path | Body |
|--------|------|------|
| **GET** | `/core/v1/cases/fields/{{field_name}}/options` | — |
| **POST** | `/core/v1/cases/fields/{{field_name}}/options` | `{"value": "nuevo_valor"}` |
| **PUT** | `/core/v1/cases/fields/{{field_name}}/options/{{option_id}}` | `{"value": "nuevo_valor"}` |
| **DELETE** | `/core/v1/cases/fields/{{field_name}}/options/{{option_id}}` | — |

### 6. Contactos (Contacts)
| Method | Path | Body |
|--------|------|------|
| **POST** | `/core/v1/contacts/` | `email`, `personal_id`, `phone` (al menos 1 required). `name`, `guid`, `password`, `organization_id`, `address`, `custom_fields[]` |
| **PUT** | `/core/v1/contacts/{{id}}` | Same fields (all optional). `organization_id: -1` to unlink. |
| **GET** | `/core/v1/contacts/` | — |
| **GET** | `/core/v1/contacts/{{id}}` | — |
| **DELETE** | `/core/v1/contacts/{{id}}` | — |

**Fields:** `id, email, personal_id, phone, name, guid, password, custom_fields, last_update, organization_id, address, city, channel_data, groups_ids`

**Filter:** `id, email, personal_id, phone, last_update, organization_id` -> IN, EQUAL. `contact.group_id` -> IN, EQUAL. `contact.<custom_field>` -> EQUAL.

### 7. Contactos / Organizaciones
| Method | Path | Body |
|--------|------|------|
| **GET** | `/core/v1/contacts/organizations` | — |
| **POST** | `/core/v1/contacts/organizations/` | `custom_id`*, `name`*, `phone`, `email`, `address`, `state`, `country`, `executives[]`, `custom_fields[]` |
| **PUT** | `/core/v1/contacts/organizations/{{id}}` | Same as POST (all optional) |
| **DELETE** | `/core/v1/contacts/organizations/{{id}}` | — |

**Fields:** `id, custom_id, name, phone, email, web, state, address, executives, custom_fields, assignment_priorities`

**custom_fields:** `field`* (string), `value`* (string).

### 8. Contactos / Grupos
| Method | Path | Body |
|--------|------|------|
| **GET** | `/core/v1/contacts/groups` | — |
| **POST** | `/core/v1/contacts/groups/` | `{"name": "nombre"}` |
| **PUT** | `/core/v1/contacts/{{contact_id}}/groups/{{group_id}}` | — |
| **DELETE** | `/core/v1/contacts/{{contact_id}}/groups/{{group_id}}` | — |

**Fields:** `id, code, name`. Filter: `id, code, name` -> IN, EQUAL.

### 9. Contactos / Importacion Masiva
| Method | Path | Body |
|--------|------|------|
| **POST** | `/core/v1/contacts/import` | `group_ids[]`*, `identifier`* (email/personal_id/phone), `action` (add_update/add_only/update_only), `fields_mapping{}` |
| **POST** | `/core/v1/contacts/import/{{importId}}/add` | Array of `[{email, phone, name, personal_id, metadata{}}]`. Max 50/request, 10k total. |
| **GET** | `/core/v1/contacts/import/{{importId}}/status` | — |

### 10. Grupos de Atencion (Queues)
| Method | Path | Body |
|--------|------|------|
| **GET** | `/core/v1/queues` | — |
| **POST** | `/core/v1/queues` | `name`* (max 50 chars), `users[{id, auto_assign}]` |
| **GET** | `/core/v1/queues/{{id}}` | — |
| **PUT** | `/core/v1/queues/{{id}}/users` | `[{id*, auto_assign}]`. Response: added/updated/unchanged summary. |
| **DELETE** | `/core/v1/queues/{{id}}/users/{{user_id}}` | — (204 No Content) |
| **DELETE** | `/core/v1/queues/{{id}}/users` | `{"ids": [10, 11, 12]}` |
| **GET** | `/core/v1/business_hours/is_open` | — (optional query: `queue_id`) |

**Fields:** `id, name, businessHours, users`.

### 11. Usuarios
| Method | Path | Body |
|--------|------|------|
| **GET** | `/core/v1/users` | — |
| **GET** | `/core/v1/users/{{id}}` | — |
| **POST** | `/core/v1/users` | `user_name`* (email), `nick`, `first_name`, `last_name`, `is_bot` |
| **PUT** | `/core/v1/users/{{id}}/queues` | `[{id*, auto_assign}]` |
| **DELETE** | `/core/v1/users/{{id}}/queues` | `{"queues_ids": [159, 6059]}` |

**Fields:** `id, user_name, nick, first_name, last_name, is_bot, created_at, last_login, queues`.

### 12. Canales
| Method | Path |
|--------|------|
| **GET** | `/core/v1/channels` |

**Fields:** `id, name, source`.

### 13. Templates WhatsApp
| Method | Path |
|--------|------|
| **GET** | `/core/v1/whatsapp_templates` |

**Fields:** `template_id, content, name, whatsapp_number, whatsapp_description`.

### 14. Encuestas (Surveys)
| Method | Path |
|--------|------|
| **GET** | `/core/v1/surveys` |
| **GET** | `/core/v1/surveys/{id}/questions` |
| **GET** | `/core/v1/surveys/{id}/responses` |

**Filter (responses):** `status` -> IN/NOT IN/EQUAL/NOT EQUAL. `responded_since, responded_until, sent_since, sent_until` -> todos.

### 15. Analytics
| Method | Path | Body |
|--------|------|------|
| **POST** | `/core/v1/analytics/export/{{id}}` | `columns` (all/only_visible), `group_by` (d/h/m), `filter{date_from*, date_to*}` |
| **GET** | `/core/v1/analytics/export/{{export_id}}/status` | Returns: export_id, status, progress, report_url. |

### 16. Orders / Mercado Libre
| Method | Path | Body |
|--------|------|------|
| **POST** | `/core/v1/orders` | `ecommerce_store_id`*, `ecommerce_platform`*, `status`*, `ecommerce_order_id`*, `reject_reason`, `total_amount`*, `sales_recovery`, `customer{name*, email*, personal_id, phone}` |
| **PUT** | `/core/v1/orders/{{id}}` | Same fields (all optional) |
| **GET** | `/core/v1/orders` | — |
| **GET** | `/core/v1/meli/orders/{{id}}` | Field `order_data` contains MELI info. |

**Fields:** `id, ecommerce_store_id, ecommerce_platform, ecommerce_order_id, status, reject_reason, total_amount, sales_recovery, customer, created_at, updated_at, order_data`

### 17. Asistentes
| Method | Path | Body |
|--------|------|------|
| **POST** | `/core/v1/assistans/node/{Id}/execute` | `{case_id, context: ["key:value", ...]}` |
| **POST** | `/core/v1/assistans/{assistantID}/{nodeName}/execute` | `{case_id, context: ["key:value", ...]}` |

### 18. NITRO (Campaigns & Transactional)
| Method | Path | Body |
|--------|------|------|
| **POST** | `/core/v1/nitro/campaigns` | `name`*, `type`* (simple/transactional), `description`, `groups_ids`* |
| **GET** | `/core/v1/nitro/campaigns` | — |
| **GET** | `/core/v1/nitro/campaigns/{{id}}` | — |
| **PUT** | `/core/v1/nitro/campaigns/{{id}}` | `name`, `description`, `groups_ids` |
| **POST** | `/core/v1/nitro/campaigns/{{id}}/messages` | `channel`* (whatsapp/email/call), `channel_config`* |
| **PUT** | `/core/v1/nitro/campaigns/{{id}}/messages/{{mid}}` | `channel_config`* (channel immutable) |
| **GET** | `/core/v1/nitro/campaigns/{{id}}/messages/{{mid}}/contacts` | — |
| **POST** | `/core/v1/nitro/campaigns/{{id}}/actions/schedule` | `{"scheduled_at": "YYYY-MM-DD HH:MM:SS"}` |
| **POST** | `/core/v1/nitro/campaigns/{{id}}/actions/send` | Sin body |
| **POST** | `/core/v1/nitro/campaigns/{{id}}/actions/activate` | Sin body |
| **POST** | `/core/v1/nitro/campaigns/{{id}}/actions/stop` | Sin body |
| **POST** | `/core/v1/nitro/campaigns/{{id}}/actions/delete` | Sin body |
| **POST** | `/core/v1/nitro/campaigns/{{id}}/actions/cancel-send` | Sin body |
| **POST** | `/core/v1/nitro/transactional/{{id}}/send` | `channels[]`*, `contact{}`*, `user_id`, `variables{}`, `metadata{}` |
| **POST** | `/core/v1/nitro/transactional/send` | Bulk: array of same objects. |
| **GET** | `/core/v1/nitro/transactional/requests/{{tracking_id}}` | — |

**WhatsApp channel_config:** `template_id`*, `variables[{name, value_from, value_default}]`, `reply_type` (group/user/assistant), `reply_id`.

---

## Pruebas de Conexion (Testing / Ping)

### Fase 1: Ping de Autenticacion
`GET https://api.wcx.cloud/core/v1/authenticate?user=test_user` con header `x-api-key`.
- **200 OK:** Credenciales validas.
- **403 Forbidden:** Credenciales invalidas.

### Fase 2: Ping de Consumo
`GET https://api.wcx.cloud/core/v1/channels?limit=1` con headers `Authorization: Bearer <token>` y `x-api-key`.

---

## Error Codes

| Codigo HTTP | Causa Probable | Accion |
| :--- | :--- | :--- |
| **400** | Parametros invalidos | No reintentar. Corregir formato. |
| **403** | Falta `x-api-key` o token expirado | Limpiar cache de token, re-autenticar, reintentar una vez. |
| **429** | Rate limit excedido (5000/min o 150000/dia) | Backoff Exponencial con Jitter. |
| **500/503** | Caida de Wise CX | Reintentar con delay (2s, 4s, 8s). |
| **501** | Method not implemented | Endpoint o metodo no soportado. |

---

## Implementacion en el proyecto

**Cliente:** `src/lib/wise-cx-client.ts`
- Exporta: `wiseCxGet`, `wiseCxPost`, `wiseCxPut`, `wiseCxDelete`
- Auth JWT con cache en memoria (55 min TTL)
- Auto-reautenticacion en 403
- Retorna `InvgateResult<T>` (mismo patron que InvGate)
- Base URL stripping y AbortController en auth request

**Variables de entorno (`.env`):**
```
WISE_CX_BASE_URL="https://api.wcx.cloud"
WISE_CX_API_KEY="<key>"
WISE_CX_API_USER="<user>"
```

**Endpoint de estado:** `GET /api/admin/wise-cx-status`
- Verifica conexion autenticando + consultando `/core/v1/channels?limit=1`
- Tarjeta en `/admin`: `src/components/ui/AdminWiseCxStatusCard.astro`

**Uso:**
```typescript
import { wiseCxGet } from "@/lib/wise-cx-client";
const result = await wiseCxGet<MyType>("/core/v1/cases");
if (result.ok) { /* result.data */ }
```
