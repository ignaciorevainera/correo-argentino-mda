# Especificación de Diseño: Configuración Mensual de Grupos en Cronograma

Este documento detalla el diseño para aislar mensualmente la configuración de grupos de rotación de sábados y la pertenencia de los operadores a dichos grupos, evitando que los cambios aplicados en un mes afecten a los meses pasados o futuros.

## Contexto y Motivación

En el portal de la Mesa de Ayuda, el módulo de **Cronograma** calcula de forma automática qué operadores deben realizar "Home Office" o tener "Franco" los sábados en base a:
1. Una configuración de rotación global (`saturdayRotationConfig`): indica cuándo inicia la rotación, qué grupo empieza, y el orden (ej. `A,B,C,D`).
2. La asignación de cada operador a un grupo de sábado (ej. operador Juan Pérez en Grupo A con horario `07:00 - 13:00`).

Actualmente, ambas configuraciones son globales. Si un supervisor cambia el orden de rotación o transfiere a un operador de un grupo a otro, el cambio se refleja de forma retroactiva en todos los meses pasados, alterando los cálculos históricos y las planificaciones guardadas.

## Cambios Propuestos

### 1. Base de Datos (`src/db/schema.ts`)

#### Modificación de Tabla `saturday_rotation_config`
Añadiremos una columna `month` para guardar una configuración de rotación específica por cada mes.
* `month`: `text("month").notNull().unique()` (formato `YYYY-MM`).

#### Nueva Tabla `agent_saturday_groups`
Crearemos una tabla relacional para almacenar las asignaciones de operadores a grupos y sus horarios de sábados por mes.
* `id`: `integer("id").primaryKey({ autoIncrement: true })`
* `agentId`: `integer("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" })`
* `month`: `text("month").notNull()` (formato `YYYY-MM`)
* `saturdayGroup`: `text("saturday_group")` (valores `A`, `B`, `C`, `D` o `null`)
* `saturdayHorario`: `text("saturday_horario")` (horario de sábado, ej. `07:00 - 13:00` o `null`)
* Índice compuesto `agent_month_idx` sobre `(agent_id, month)` para búsquedas rápidas.

### 2. Capa de API (Backend)

#### `GET /api/cronograma`
* Aceptará un parámetro de consulta opcional `?month=YYYY-MM`. Si no se especifica, detectará automáticamente el mes activo (basándose en los horarios existentes o el mes actual).
* Consultará la tabla `agent_saturday_groups` para el mes solicitado.
* Si un operador no tiene una asignación explícita en el mes solicitado, buscará la asignación del mes anterior cronológicamente. Si no hay registros previos, usará por defecto las columnas `saturdayGroup` y `saturdayHorario` de la tabla `agents` como plantilla inicial.
* Devolverá en la respuesta:
  * `operators`: lista de operadores para el mes activo, con sus respectivas asignaciones de grupos resueltas para este mes.
  * `availableMonths`: lista de todos los meses con datos registrados (`YYYY-MM`).
  * `activeMonth`: el mes resuelto para el cual se cargaron los datos.

#### `GET /api/cronograma/rotation-config`
* Aceptará `?month=YYYY-MM`.
* Buscará la configuración del mes solicitado.
* Si no existe, buscará la configuración del último mes activo disponible. Si no hay registros históricos, inicializará el mes actual con la configuración estándar por defecto (`rotationOrder: "A,B,C,D"`, `startDate: "2026-06-06"`, `startGroup: "A"`).

#### `POST /api/cronograma/rotation-config`
* Recibirá en el cuerpo: `{ month, startDate, startGroup, rotationOrder }`.
* Insertará o actualizará la configuración de rotación específicamente para el mes indicado.

#### `POST /api/cronograma/rotation-groups/members`
* Recibirá en el cuerpo: `{ month, agentId, saturdayGroup, saturdayHorario }`.
* Insertará o actualizará el registro correspondiente en la tabla `agent_saturday_groups` para el `agentId` y `month` indicados.

### 3. Interfaz de Usuario y Cliente (`dashboard-client.ts`)

* Al iniciar la aplicación, se cargará el mes inicial detectado.
* Al presionar las flechas de navegación de meses o seleccionar un mes del dropdown, el cliente:
  1. Actualizará la URL de consulta con el nuevo mes.
  2. Llamará a `/api/cronograma?month=YYYY-MM` y actualizará el estado local (`state.cronoData`).
  3. Llamará a `/api/cronograma/rotation-config?month=YYYY-MM` para refrescar la configuración de rotación activa.
  4. Volverá a renderizar la vista diaria, mensual y de grupos con la información del nuevo mes activo.
* En la pestaña **Grupos**, se mostrará de forma destacada el mes seleccionado en la cabecera (ej: *"Configurando grupos para Junio 2026"*).
* Cualquier acción de agregar, quitar o editar horario en los grupos enviará la variable del mes activo (`currentMonth`) a la API.

## Plan de Verificación

### Pruebas de Flujo
1. **Aislamiento de Cambios:** Asignar un operador al Grupo A en Junio 2026. Cambiarlo al Grupo B en Julio 2026. Verificar que en la vista de Junio 2026 siga figurando en el Grupo A y en Julio en el Grupo B.
2. **Herencia de Meses:** Crear el mes Agosto 2026 y comprobar que hereda automáticamente los grupos y la configuración de rotación de Julio 2026.
3. **Persistencia del Historial:** Asegurar que los sábados pasados ya calculados no sufran alteraciones de "Home Office" o "Franco" tras modificar configuraciones de rotación en meses posteriores.
