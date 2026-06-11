# Especificación de Diseño: Gestión de Horas Extras de Fin de Semana

**Fecha:** 2026-06-10
**Módulo:** Cronograma / Horas Extras Fin de Semana

## 1. Contexto y Objetivos

Actualmente, el sistema de Cronograma permite gestionar la rotación de los sábados de 07:00 a 13:00 hs dividiendo a los operadores en grupos (A, B, C, D) que rotan semanalmente para realizar Home Office.

El objetivo de esta propuesta es integrar el apartado de **Horas Extras de Fin de Semana** dentro del Cronograma. Esta cobertura especial abarca desde el **sábado a partir de las 13:00 hs en adelante hasta el final del domingo**. Tal como en el archivo Excel de referencia, se asignarán turnos con horarios personalizados y se definirá un "Referente" a cargo para cada fin de semana.

---

## 2. Experiencia de Usuario (UI/UX)

### A. Selector de Vistas Principal
Se añadirá una nueva pestaña llamada **Extras** al selector de vistas principal del cronograma (`#view-switcher`), quedando con las siguientes opciones:
* **Mensual**
* **Diario**
* **Grupos**
* **Extras** (Nueva)

### B. Vista de Horas Extras (`#overtime-view`)
Al hacer clic en "Extras", se mostrará un panel completo con:
1. **Selector de Fin de Semana**: Un control de fecha que permite seleccionar un fin de semana específico (siempre anclado al sábado correspondiente, mostrando la etiqueta `Sábado dd/mm - Domingo dd/mm`).
2. **Referente del Fin de Semana**: Un campo de texto simple/desplegable para asignar y guardar el nombre del Referente (coordinador/supervisor a cargo).
3. **Línea de Tiempo Visual Horizontal**:
   * Una cuadrícula visual horizontal estructurada que simula el Excel de referencia.
   * Mostrará las columnas de horas desde el **Sábado 13:00hs hasta el Domingo 24:00hs** (se puede dividir en dos filas visuales o un grid estructurado para optimizar espacio: bloque de Sábado 13:00 a Domingo 11:00, y bloque de Domingo 19:00 a 00:00).
   * Los turnos asignados se graficarán como bloques horizontales (con anchos proporcionales a su duración) mostrando el nombre del operador y su horario.
   * Todos los bloques de horas extras tendrán un **estilo visual único, estándar y profesional** (ej. un fondo azul-azulado o grisáceo suave alineado con `DESIGN.md`), en lugar de colores arbitrarios.
4. **Gestor de Turnos (Formulario/Lista)**:
   * Permite agregar un nuevo turno indicando:
     * **Operador** (Selector de agentes existentes).
     * **Día** (Sábado / Domingo).
     * **Hora de Inicio** (Time input).
     * **Hora de Fin** (Time input).
   * Lista de turnos asignados con botones de edición y eliminación rápida.

### C. Integración en el Calendario Mensual y Diario

> [!IMPORTANT]
> **Reglas de negocio críticas para Horas Extras:**
> 1. Las horas extras se realizan siempre bajo la modalidad de **Home Office**.
> 2. Se soporta la asignación de **múltiples estados/turnos a un mismo día** para un mismo operador. Por ejemplo, un sábado un operador puede tener su turno rotativo regular de **07:00 a 13:00 hs** (Home Office por grupo activo) y también un turno de horas extras de **13:00 a 17:00 hs**.

1. **Celda del Calendario Mensual**:
   * La celda del calendario mensual mantendrá el color del estado de su turno base (ej. "Franco" en gris, o "Home Office" en azul si estaba de guardia por su grupo de rotación del sábado).
   * Se añadirá un pequeño distintivo o etiqueta visual compacta e indicador dentro de la celda indicando **"HE: 13:00 - 17:00"** (o el horario correspondiente).
   * En caso de tener ambos estados (rotación + horas extras), ambos se computan y muestran correspondientemente.
2. **Detalle del Día (Modal de Detalle / Vista Diaria)**:
   * Al hacer clic en un día o abrir el modal de detalles de un operador, se mostrará el desglose detallado de su jornada, indicando tanto su estado/horario regular como sus turnos de Horas Extras asignados.
   * En la vista diaria, se graficarán ambos bloques de horas en su franja horaria correspondiente (por ejemplo: de 07:00 a 13:00 hs y de 13:00 a 17:00 hs).

---

## 3. Arquitectura de Datos y Base de Datos

Añadiremos dos nuevas tablas al esquema de la base de datos en [schema.ts](file:///d:/correo-argentino-mda/src/db/schema.ts):

### A. Tabla `weekend_overtime_config`
Almacena la configuración general de cada fin de semana (principalmente el Referente).
```typescript
export const weekendOvertimeConfig = sqliteTable("weekend_overtime_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekendStartDate: text("weekend_start_date").notNull().unique(), // Sábado "YYYY-MM-DD"
  referente: text("referente").notNull(),
});
```

### B. Tabla `weekend_overtime_shifts`
Almacena cada uno de los bloques de turnos asignados.
```typescript
export const weekendOvertimeShifts = sqliteTable("weekend_overtime_shifts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekendStartDate: text("weekend_start_date").notNull(), // Sábado "YYYY-MM-DD" para agrupar
  agentId: integer("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // "YYYY-MM-DD" (el Sábado o Domingo correspondiente)
  startTime: text("start_time").notNull(), // "HH:MM"
  endTime: text("end_time").notNull(), // "HH:MM"
});
```

---

## 4. Endpoints de API

Se crearán los siguientes endpoints API en el backend:

1. **`GET /api/cronograma/overtime`**
   * Retorna la configuración de horas extras (referentes y turnos) para un fin de semana específico, o todos los registros para cruzar con el calendario.
   * Parámetros opcionales: `weekendStartDate` (YYYY-MM-DD).

2. **`POST /api/cronograma/overtime/config`**
   * Crea o actualiza la configuración de referente para un fin de semana.
   * Body: `{ weekendStartDate: string, referente: string }`.

3. **`POST /api/cronograma/overtime/shifts`**
   * Agrega o actualiza un turno de hora extra.
   * Body: `{ id?: number, weekendStartDate: string, agentId: number, date: string, startTime: string, endTime: string }`.

4. **`DELETE /api/cronograma/overtime/shifts`**
   * Elimina un turno de hora extra.
   * Body: `{ id: number }`.

5. **Actualización de `GET /api/cronograma`**:
   * Modificaremos el endpoint principal de obtención de datos para integrar la información de horas extras dentro del objeto de cada operador (`OperatorData`) como una lista de turnos, permitiendo que las vistas mensuales y diarias rendericen las etiquetas de manera eficiente y centralizada.

---

## 5. Plan de Verificación

### Pruebas Manuales
1. **Asignación de Referente**: Ingresar un referente para un fin de semana específico y verificar que persiste al recargar.
2. **Creación de Turnos**: Crear un turno el sábado de 13:00 a 17:00 hs para un operador. Verificar que se grafica en la línea de tiempo.
3. **Cruce de Medianoche**: Probar un turno que cruza la medianoche (ej. Sábado 21:00 a Domingo 01:00) y corroborar su correcta visualización y desglose en ambos días.
4. **Visualización en Calendario**: Navegar a la vista mensual y validar que el operador seleccionado muestra la insignia de Hora Extra con su respectivo horario.
5. **Edición y Eliminación**: Editar el horario de un turno y eliminarlo, verificando que los cambios se reflejan al instante.
