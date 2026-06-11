# Plan de Implementación: Configuración Mensual de Grupos en Cronograma

Este plan detalla los pasos para aislar mensualmente la configuración de grupos de rotación de sábados y la membresía de los operadores, asegurando que los cambios realizados en un mes no alteren de forma retroactiva el historial o cálculos de otros meses.

> **Para el agente:** REQUERIMIENTO SUB-SKILL: Usa superpowers:subagent-driven-development o superpowers:executing-plans para implementar este plan paso a paso. Los pasos utilizan la sintaxis de casillas (`- [ ]`) para su seguimiento.

**Meta:** Lograr que la configuración de rotación de sábados y la asignación de operadores a grupos A/B/C/D apliquen exclusivamente a nivel mensual, heredando configuraciones previas al crear nuevos meses y aislando los cambios históricos.

**Arquitectura:**
1. Añadir la columna `month` a la tabla `saturday_rotation_config` en la base de datos SQLite y crear la tabla relacional `agent_saturday_groups` para mapear operadores a grupos por mes.
2. Actualizar las APIs `/api/cronograma`, `/api/cronograma/rotation-config` y `/api/cronograma/rotation-groups/members` para que operen en función de un parámetro `month` (formato `YYYY-MM`).
3. Actualizar el cliente JS en el frontend para enviar el mes activo actual en todas las consultas de grupos y rotación, y recargar la información al cambiar de mes.

**Fichas Técnicas:**
- Base de datos: SQLite con Drizzle ORM
- Servidor: Astro SSR (endpoints en `src/pages/api/...`)
- Cliente: Vanilla JS en `src/components/cronograma/lib/dashboard-client.ts`

---

## Cambios Propuestos

### Task 1: Modificar Esquema de Base de Datos y Ejecutar Migración

**Archivos:**
- Modificar: [schema.ts](file:///d:/correo-argentino-mda/src/db/schema.ts)
- Ejecutar comando: `npm run db:push`

- [ ] **Paso 1: Modificar `saturdayRotationConfig` y definir `agentSaturdayGroups`**
  Modificar el archivo [schema.ts](file:///d:/correo-argentino-mda/src/db/schema.ts) para agregar la columna `month` y la nueva tabla.

  *Código a modificar/agregar en [schema.ts](file:///d:/correo-argentino-mda/src/db/schema.ts):*
  ```typescript
  // Modificar saturdayRotationConfig para agregar la columna month
  export const saturdayRotationConfig = sqliteTable("saturday_rotation_config", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    month: text("month").notNull().unique(), // "YYYY-MM"
    rotationOrder: text("rotation_order").notNull().default("A,B,C,D"),
    startDate: text("start_date").notNull().default("2026-06-06"),
    startGroup: text("start_group").notNull().default("A"),
  });

  // Agregar la nueva tabla agentSaturdayGroups
  export const agentSaturdayGroups = sqliteTable("agent_saturday_groups", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // "YYYY-MM"
    saturdayGroup: text("saturday_group"),
    saturdayHorario: text("saturday_horario"),
  }, (table) => ({
    agentMonthIdx: index("agent_month_idx").on(table.agentId, table.month),
  }));
  ```

- [ ] **Paso 2: Ejecutar Drizzle Kit Push para aplicar los cambios en la base de datos local**
  Ejecutar el comando en la terminal:
  `npm run db:push`
  *Resultado esperado:* La herramienta creará la tabla `agent_saturday_groups` y modificará `saturday_rotation_config`. (Drizzle Kit podría solicitar vaciar/reiniciar la tabla `saturday_rotation_config` porque añadimos una columna `NOT NULL` sin default. Acepta y confirma, ya que la API la regenerará automáticamente).

- [ ] **Paso 3: Realizar commit de los cambios de base de datos**
  Ejecutar:
  `git add src/db/schema.ts; git commit -m "db: add month to rotation config and create agentSaturdayGroups table"`

---

### Task 2: Actualizar Endpoints de Configuración de Rotación

**Archivos:**
- Modificar: [rotation-config.ts](file:///d:/correo-argentino-mda/src/pages/api/cronograma/rotation-config.ts)

- [ ] **Paso 1: Modificar `rotation-config.ts` para que filtre y guarde por `month`**
  Modificar el archivo [rotation-config.ts](file:///d:/correo-argentino-mda/src/pages/api/cronograma/rotation-config.ts). Al consultar (GET), si no existe configuración para el mes solicitado, buscará la configuración del mes anterior cronológicamente para heredarla, o creará el default de inicio.

  *Código de reemplazo completo para [rotation-config.ts](file:///d:/correo-argentino-mda/src/pages/api/cronograma/rotation-config.ts):*
  ```typescript
  import type { APIRoute } from "astro";
  import { db } from "@/db";
  import { saturdayRotationConfig } from "@/db/schema";
  import { eq, desc, lt } from "drizzle-orm";

  export const GET: APIRoute = async ({ url }) => {
    try {
      const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
      
      // Intentar obtener la configuración específica de este mes
      let configList = await db
        .select()
        .from(saturdayRotationConfig)
        .where(eq(saturdayRotationConfig.month, month))
        .limit(1);
      
      let config = configList[0];

      // Si no existe, intentar heredar del mes anterior más cercano
      if (!config) {
        const previousConfigs = await db
          .select()
          .from(saturdayRotationConfig)
          .where(lt(saturdayRotationConfig.month, month))
          .orderBy(desc(saturdayRotationConfig.month))
          .limit(1);
        
        const baseConfig = previousConfigs[0] || {
          rotationOrder: "A,B,C,D",
          startDate: "2026-06-06",
          startGroup: "A",
        };

        // Crear una nueva configuración para el mes actual heredando los parámetros
        await db.insert(saturdayRotationConfig).values({
          month,
          rotationOrder: baseConfig.rotationOrder,
          startDate: baseConfig.startDate,
          startGroup: baseConfig.startGroup,
        });

        configList = await db
          .select()
          .from(saturdayRotationConfig)
          .where(eq(saturdayRotationConfig.month, month))
          .limit(1);
        config = configList[0];
      }

      return new Response(JSON.stringify(config), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("GET rotation-config API Error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };

  export const POST: APIRoute = async ({ request }) => {
    try {
      const { month, rotationOrder, startDate, startGroup } = await request.json();
      
      if (!month) {
        return new Response(JSON.stringify({ error: "Month is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const configList = await db
        .select()
        .from(saturdayRotationConfig)
        .where(eq(saturdayRotationConfig.month, month))
        .limit(1);
      const existing = configList[0];

      if (existing) {
        await db
          .update(saturdayRotationConfig)
          .set({ rotationOrder, startDate, startGroup })
          .where(eq(saturdayRotationConfig.id, existing.id));
      } else {
        await db
          .insert(saturdayRotationConfig)
          .values({
            month,
            rotationOrder,
            startDate,
            startGroup,
          });
      }

      const updatedList = await db
        .select()
        .from(saturdayRotationConfig)
        .where(eq(saturdayRotationConfig.month, month))
        .limit(1);
      const result = updatedList[0];

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("POST rotation-config API Error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
  ```

- [ ] **Paso 2: Realizar commit de los cambios de rotation-config**
  Ejecutar:
  `git add src/pages/api/cronograma/rotation-config.ts; git commit -m "api: update rotation-config to support monthly scoping"`

---

### Task 3: Actualizar Endpoint de Membresía de Grupos

**Archivos:**
- Modificar: [members.ts](file:///d:/correo-argentino-mda/src/pages/api/cronograma/rotation-groups/members.ts)

- [ ] **Paso 1: Modificar `members.ts` para escribir en `agentSaturdayGroups`**
  Modificar el archivo [members.ts](file:///d:/correo-argentino-mda/src/pages/api/cronograma/rotation-groups/members.ts). En lugar de modificar la tabla `agents` globalmente, creará o actualizará la asignación específica del mes en `agentSaturdayGroups`.

  *Código de reemplazo completo para [members.ts](file:///d:/correo-argentino-mda/src/pages/api/cronograma/rotation-groups/members.ts):*
  ```typescript
  import type { APIRoute } from "astro";
  import { db } from "@/db";
  import { agentSaturdayGroups } from "@/db/schema";
  import { and, eq } from "drizzle-orm";

  export const POST: APIRoute = async ({ request }) => {
    try {
      const { agentId, saturdayGroup, saturdayHorario, month } = await request.json();

      if (agentId === undefined || agentId === null) {
        return new Response(JSON.stringify({ error: "Missing agentId" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!month) {
        return new Response(JSON.stringify({ error: "Missing month" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const parsedAgentId = typeof agentId === "string" ? parseInt(agentId, 10) : agentId;

      if (isNaN(parsedAgentId)) {
        return new Response(JSON.stringify({ error: "Invalid agentId" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Buscar si ya existe una asignación para este operador y mes
      const existing = await db
        .select()
        .from(agentSaturdayGroups)
        .where(
          and(
            eq(agentSaturdayGroups.agentId, parsedAgentId),
            eq(agentSaturdayGroups.month, month)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(agentSaturdayGroups)
          .set({
            saturdayGroup: saturdayGroup || null,
            saturdayHorario: saturdayHorario || null,
          })
          .where(eq(agentSaturdayGroups.id, existing[0].id));
      } else {
        await db
          .insert(agentSaturdayGroups)
          .values({
            agentId: parsedAgentId,
            month,
            saturdayGroup: saturdayGroup || null,
            saturdayHorario: saturdayHorario || null,
          });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("POST rotation-groups members API Error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
  ```

- [ ] **Paso 2: Realizar commit de los cambios de members**
  Ejecutar:
  `git add src/pages/api/cronograma/rotation-groups/members.ts; git commit -m "api: update members api to save to agentSaturdayGroups"`

---

### Task 4: Actualizar API Principal de Datos de Cronograma

**Archivos:**
- Modificar: [index.ts](file:///d:/correo-argentino-mda/src/pages/api/cronograma/index.ts)

- [ ] **Paso 1: Modificar `GET` en `index.ts` para que devuelva datos mensuales resueltos**
  Ajustar el archivo [index.ts](file:///d:/correo-argentino-mda/src/pages/api/cronograma/index.ts).
  - Aceptará `?month=YYYY-MM`. Si no se pasa, determinará el mes activo dinámicamente buscando el mes más reciente con horarios, o el mes actual por defecto.
  - Filtrará schedules por ese mes (`like(schedules.date, '${activeMonth}-%')`).
  - Obtendrá la configuración de rotación específica de ese mes.
  - Obtendrá los grupos de sábados de ese mes para todos los operadores (`agent_saturday_groups`).
  - Si un operador no tiene asignación en ese mes en `agent_saturday_groups`, buscará de meses anteriores. Si no los hay, caerá en el default de `agents`.
  - Devolverá la lista de meses disponibles (`availableMonths`) y el `activeMonth` resuelto.

  *Código de reemplazo para la sección GET (líneas 6 a 191) de [index.ts](file:///d:/correo-argentino-mda/src/pages/api/cronograma/index.ts):*
  ```typescript
  export const GET: APIRoute = async ({ url }) => {
    try {
      // 1. Determinar el mes activo y meses disponibles
      const dbSchedulesList = await db.select({ date: schedules.date }).from(schedules);
      const uniqueMonthsSet = new Set(dbSchedulesList.map(s => s.date.slice(0, 7)));
      const availableMonths = Array.from(uniqueMonthsSet).sort();
      
      const currentMonthDefault = new Date().toISOString().slice(0, 7);
      const activeMonth = url.searchParams.get("month") || (availableMonths.length > 0 ? availableMonths[availableMonths.length - 1] : currentMonthDefault);

      // 2. Cargar configuración de rotación para este mes
      let configList = await db.select().from(saturdayRotationConfig).where(eq(saturdayRotationConfig.month, activeMonth)).limit(1);
      let rotationConfig = configList[0];
      if (!rotationConfig) {
        // Fallback: intentar copiar el anterior más cercano
        const previousConfigs = await db
          .select()
          .from(saturdayRotationConfig)
          .where(lt(saturdayRotationConfig.month, activeMonth))
          .orderBy(desc(saturdayRotationConfig.month))
          .limit(1);
        
        const baseConfig = previousConfigs[0] || {
          rotationOrder: "A,B,C,D",
          startDate: "2026-06-06",
          startGroup: "A",
        };

        await db.insert(saturdayRotationConfig).values({
          month: activeMonth,
          rotationOrder: baseConfig.rotationOrder,
          startDate: baseConfig.startDate,
          startGroup: baseConfig.startGroup,
        });

        configList = await db.select().from(saturdayRotationConfig).where(eq(saturdayRotationConfig.month, activeMonth)).limit(1);
        rotationConfig = configList[0];
      }

      // 3. Cargar asignaciones de grupos de sábados específicas de este mes
      const dbMonthlyGroups = await db.select().from(agentSaturdayGroups).where(eq(agentSaturdayGroups.month, activeMonth));
      const monthlyGroupsMap = new Map(dbMonthlyGroups.map(g => [g.agentId, g]));

      // 4. Buscar asignaciones del mes anterior en caso de fallback
      const dbPreviousMonthlyGroups = await db
        .select()
        .from(agentSaturdayGroups)
        .where(lt(agentSaturdayGroups.month, activeMonth))
        .orderBy(desc(agentSaturdayGroups.month));
      // Agrupar por agente para obtener el más reciente que sea menor al mes activo
      const previousGroupsMap = new Map<number, typeof agentSaturdayGroups.$inferSelect>();
      for (const pg of dbPreviousMonthlyGroups) {
        if (!previousGroupsMap.has(pg.agentId)) {
          previousGroupsMap.set(pg.agentId, pg);
        }
      }

      // 5. Cargar todos los agentes
      const dbAgents = await db.select().from(agents);

      // 6. Cargar horas extras de fin de semana para este mes
      const dbOvertimeConfigs = await db.select().from(weekendOvertimeConfig);
      const dbOvertimeShifts = await db.select().from(weekendOvertimeShifts);

      const baseline = dbAgents.map((agent) => {
        // Resolver el grupo y horario de sábado para este mes
        let group = agent.saturdayGroup || undefined;
        let horarioSat = agent.saturdayHorario || undefined;

        // Comprobar si hay asignación específica para este mes
        const monthlyConfig = monthlyGroupsMap.get(agent.id);
        if (monthlyConfig) {
          group = monthlyConfig.saturdayGroup || undefined;
          horarioSat = monthlyConfig.saturdayHorario || undefined;
        } else {
          // Si no, comprobar si hay asignación histórica previa para copiarla a este mes
          const prevConfig = previousGroupsMap.get(agent.id);
          if (prevConfig) {
            group = prevConfig.saturdayGroup || undefined;
            horarioSat = prevConfig.saturdayHorario || undefined;
          }
        }

        return {
          id: agent.id,
          nombre: agent.name,
          username: agent.username || undefined,
          horario: agent.horarioDefault,
          location: agent.location || "Monte Grande",
          asistencia: {},
          esquema_semanal: agent.esquemaSemanal || {},
          esquema_horario: agent.esquemaHorario || {},
          esquema_break_inicio: agent.esquemaBreakInicio || {},
          esquema_break_fin: agent.esquemaBreakFin || {},
          maxConsecutiveHO: agent.maxConsecutiveHO,
          minPWeek: agent.minPWeek,
          saturdayGroup: group,
          saturdayHorario: horarioSat,
        };
      });

      // 7. Buscar horarios específicos del mes de schedules de la base de datos
      const dbSchedules = await db
        .select()
        .from(schedules)
        .where(like(schedules.date, `${activeMonth}-%`));

      // 8. Combinar schedules sobre la base
      const merged = baseline.map((operator: any) => {
        const name = operator.nombre;
        const opOverrides = dbSchedules.filter((s) => s.agentName === name);

        const newAsistencia = { ...operator.asistencia };
        const newComentarios: Record<string, string> = {};
        const newHorariosDias: Record<string, string> = {};
        const newEntradasReales: Record<string, string> = {};
        const newSalidasReales: Record<string, string> = {};
        const newBreaksInicio: Record<string, string> = {};
        const newBreaksFin: Record<string, string> = {};
        const overrides: Record<string, boolean> = {};

        opOverrides.forEach((s) => {
          let status = s.status;
          let horario = s.horario;

          if (s.isOverride) {
            overrides[s.date] = true;
          }

          // Cálculo dinámico de sábados de rotación
          const dateObj = new Date(s.date + "T12:00:00");
          const isSaturday = dateObj.getDay() === 6;
          if (isSaturday && operator.saturdayGroup) {
            const start = new Date(rotationConfig.startDate + "T12:00:00");
            const diffDays = Math.round((dateObj.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            const weeksDiff = Math.floor(diffDays / 7);
            const groups = rotationConfig.rotationOrder.split(",").map((g) => g.trim());
            const N = groups.length;
            const startIndex = groups.indexOf(rotationConfig.startGroup);
            const idx = startIndex >= 0 ? startIndex : 0;
            const activeIndex = ((idx + weeksDiff) % N + N) % N;
            const activeGroup = groups[activeIndex];

            if (operator.saturdayGroup === activeGroup && !s.isOverride) {
              status = "Home Office";
              horario = operator.saturdayHorario || "07:00 - 13:00";
            }
          }

          if (status === "Franco" || status === "") {
            newAsistencia[s.date] = "Franco";
          } else {
            newAsistencia[s.date] = status;
          }
          if (s.comment) {
            newComentarios[s.date] = s.comment;
          }
          if (horario !== undefined && horario !== null) {
            newHorariosDias[s.date] = horario;
          }
          if (s.breakInicio) {
            newBreaksInicio[s.date] = s.breakInicio;
          }
          if (s.breakFin) {
            newBreaksFin[s.date] = s.breakFin;
          }
        });

        // Completar días vacíos con defaults semanales
        const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
        Object.keys(newAsistencia).forEach(dateStr => {
          const dateObj = new Date(dateStr + "T12:00:00");
          const dayName = dayNames[dateObj.getDay()];
          const status = newAsistencia[dateStr];

          if (newHorariosDias[dateStr] === undefined) {
            if (operator.esquema_horario?.[dayName]) {
              newHorariosDias[dateStr] = operator.esquema_horario[dayName];
            } else if (status !== "Franco") {
              newHorariosDias[dateStr] = operator.horario || "08:00 - 17:00";
            } else {
              newHorariosDias[dateStr] = "";
            }
          }

          if (newBreaksInicio[dateStr] === undefined) {
            if (operator.esquema_break_inicio?.[dayName]) {
              newBreaksInicio[dateStr] = operator.esquema_break_inicio[dayName];
            } else {
              newBreaksInicio[dateStr] = "";
            }
          }

          if (newBreaksFin[dateStr] === undefined) {
            if (operator.esquema_break_fin?.[dayName]) {
              newBreaksFin[dateStr] = operator.esquema_break_fin[dayName];
            } else {
              newBreaksFin[dateStr] = "";
            }
          }
        });

        const agentOvertimes = operator.id
          ? dbOvertimeShifts
              .filter((s) => s.agentId === operator.id)
              .map((s) => ({
                id: s.id,
                weekendStartDate: s.weekendStartDate,
                agentId: s.agentId,
                date: s.date,
                startTime: s.startTime,
                endTime: s.endTime,
              }))
          : [];

        return {
          ...operator,
          asistencia: newAsistencia,
          comentarios: newComentarios,
          horarios_dias: newHorariosDias,
          entradas_reales: newEntradasReales,
          salidas_reales: newSalidasReales,
          breaks_inicio: newBreaksInicio,
          breaks_fin: newBreaksFin,
          overrides,
          weekendOvertimes: agentOvertimes,
        };
      });

      const responsePayload = {
        operators: merged,
        weekendOvertimeConfigs: dbOvertimeConfigs,
        availableMonths,
        activeMonth,
      };

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("GET API Error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
  ```

- [ ] **Paso 2: Realizar commit de los cambios del endpoint principal**
  Ejecutar:
  `git add src/pages/api/cronograma/index.ts; git commit -m "api: make schedule GET API monthly scoped with fallback logic"`

---

### Task 5: Actualizar Estado local del Cliente y API helper

**Archivos:**
- Modificar: [state.ts](file:///d:/correo-argentino-mda/src/components/cronograma/lib/state.ts)
- Modificar: [api.ts](file:///d:/correo-argentino-mda/src/components/cronograma/lib/api.ts)

- [ ] **Paso 1: Añadir `availableMonths` al estado en `state.ts`**
  Modificar [state.ts](file:///d:/correo-argentino-mda/src/components/cronograma/lib/state.ts) para almacenar la lista de meses provista por el servidor, sirviendo de respaldo a `uniqueMonths`.

  *Código a modificar en [state.ts](file:///d:/correo-argentino-mda/src/components/cronograma/lib/state.ts):*
  ```typescript
  // Línea ~28 (agregar la variable al inicio de la clase):
  availableMonths: string[] = [];

  // Reemplazar la propiedad uniqueMonths (línea ~103):
  get uniqueMonths(): string[] {
    if (this.availableMonths && this.availableMonths.length > 0) {
      return this.availableMonths;
    }
    if (this._cachedMonths) return this._cachedMonths;
    const monthsSet = new Set(this.uniqueDates.map(d => d.slice(0, 7)));
    this._cachedMonths = Array.from(monthsSet).sort();
    return this._cachedMonths;
  }
  ```

- [ ] **Paso 2: Modificar helper `fetchCronogramaFullData` en `api.ts` para aceptar `month`**
  Modificar [api.ts](file:///d:/correo-argentino-mda/src/components/cronograma/lib/api.ts).

  *Código a modificar en [api.ts](file:///d:/correo-argentino-mda/src/components/cronograma/lib/api.ts):*
  ```typescript
  export async function fetchCronogramaFullData(month?: string): Promise<CronogramaPayload> {
    if (typeof window !== 'undefined' && (window as any).__CRONOGRAMA_INITIAL_DATA__) {
      const data = (window as any).__CRONOGRAMA_INITIAL_DATA__;
      delete (window as any).__CRONOGRAMA_INITIAL_DATA__;
      if (Array.isArray(data)) {
        return { operators: data, weekendOvertimeConfigs: [] };
      }
      return data as CronogramaPayload;
    }
    const url = month ? `/api/cronograma?month=${month}` : '/api/cronograma';
    return fetchJSON<CronogramaPayload>(url);
  }

  // Modificar fetchCronogramaData para aceptar month:
  export async function fetchCronogramaData(month?: string): Promise<OperatorData[]> {
    const payload = await fetchCronogramaFullData(month);
    return payload.operators;
  }
  ```

- [ ] **Paso 3: Realizar commit de los cambios de estado y api client**
  Ejecutar:
  `git add src/components/cronograma/lib/state.ts src/components/cronograma/lib/api.ts; git commit -m "client: add availableMonths to state and accept month in fetch helper"`

---

### Task 6: Actualizar Cliente Frontend para Sincronizar Cambios por Mes

**Archivos:**
- Modificar: [dashboard-client.ts](file:///d:/correo-argentino-mda/src/components/cronograma/lib/dashboard-client.ts)
- Modificar: [CronogramaDashboard.astro](file:///d:/correo-argentino-mda/src/components/cronograma/CronogramaDashboard.astro)

- [ ] **Paso 1: Modificar `CronogramaDashboard.astro` para agregar indicador visual de mes en Grupos**
  Modificar el archivo [CronogramaDashboard.astro](file:///d:/correo-argentino-mda/src/components/cronograma/CronogramaDashboard.astro) para añadir una etiqueta que indique qué mes se está configurando en la pestaña de Grupos.

  *Código a modificar en [CronogramaDashboard.astro](file:///d:/correo-argentino-mda/src/components/cronograma/CronogramaDashboard.astro) (alrededor de la línea ~504):*
  ```astro
  <div id="groups-view" class="animate-in slide-in-from-bottom-2 fade-in duration-500 hidden">
    <div class="bg-base-100 rounded-2xl border border-base-300 shadow-md p-6 space-y-6">
      <!-- Añadir este bloque de cabecera informativa de mes -->
      <div class="flex items-center justify-between border-b border-base-300 pb-3">
        <div>
          <h2 class="text-base font-black text-base-content uppercase tracking-wide">Configuración de Grupos</h2>
          <p class="text-xs text-base-content/50">Establece la rotación y horarios de sábados aplicados únicamente al mes seleccionado.</p>
        </div>
        <div class="badge badge-secondary badge-lg font-bold text-xs uppercase tracking-wider py-3" id="groups-active-month-badge">
          Mes: -
        </div>
      </div>
  ```

- [ ] **Paso 2: Modificar carga de datos, recarga y llamadas de grupos en `dashboard-client.ts`**
  Modificar [dashboard-client.ts](file:///d:/correo-argentino-mda/src/components/cronograma/lib/dashboard-client.ts) para:
  1. Guardar `availableMonths` en `state` tras cada fetch exitoso.
  2. Obtener el mes activo actual (`currentMonth = dateInput.value.slice(0, 7)`) en todas las peticiones a APIs de grupos y rotación.
  3. Actualizar la función `init()` para llamar a `fetchCronogramaFullData()` y la carga de configuraciones usando el mes de `dateInput`.
  4. Modificar `changeMonth` y el dropdown selector de mes para hacer recargas completas de API al cambiar el mes seleccionado.
  5. Enviar el mes actual en las llamadas de asignación de grupos (`members`) y guardado de rotación (`rotation-config`).
  6. Actualizar la visualización de la etiqueta de mes activo en la pestaña de Grupos (`groups-active-month-badge`).

  *Modificación 1: Helper de mes activo actual en [dashboard-client.ts](file:///d:/correo-argentino-mda/src/components/cronograma/lib/dashboard-client.ts)*
  ```typescript
  function getActiveMonthPrefix(): string {
    const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
    return dateInput && dateInput.value ? dateInput.value.slice(0, 7) : new Date().toISOString().slice(0, 7);
  }
  ```

  *Modificación 2: Reemplazo en `init()` (alrededor de la línea ~422):*
  ```typescript
  async function init(): Promise<void> {
    try {
      const activeMonth = getActiveMonthPrefix();
      const payload = await fetchCronogramaFullData(activeMonth);
      state.cronoData = payload.operators;
      // Guardar meses disponibles en el estado
      if ((payload as any).availableMonths) {
        state.availableMonths = (payload as any).availableMonths;
      }
      overtimeConfigs = payload.weekendOvertimeConfigs;

      try {
        const feriadosRes = await fetch('/api/cronograma/feriados');
        if (feriadosRes.ok) {
          state.feriados = await feriadosRes.json();
        }
      } catch (err) {
        console.warn("Failed to load holidays:", err);
      }

      try {
        const rotRes = await fetch(`/api/cronograma/rotation-config?month=${activeMonth}`);
        if (rotRes.ok) {
          activeRotationConfig = await rotRes.json();
        }
      } catch (err) {
        console.warn("Failed to load rotation config:", err);
      }

      const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
      const todayStr = formatYMD(new Date());
      const hasDataForToday = state.cronoData.some(op => op.asistencia[todayStr]);
      const initialDate = hasDataForToday ? todayStr : (state.uniqueDates[state.uniqueDates.length - 1] || todayStr);

      if (dateInput) {
        dateInput.value = initialDate;
        updateDateInputDisplay();
        updateMonthDisplay();
        if (state.uniqueDates.length > 0) {
          dateInput.min = state.uniqueDates[0];
          dateInput.max = state.uniqueDates[state.uniqueDates.length - 1];
        }
      }
  ```

  *Modificación 3: Recarga de datos al cambiar de mes en `changeMonth` y click en dropdown (líneas ~367 y ~416):*
  Crear un helper de recarga al cambiar de mes:
  ```typescript
  async function reloadDataForActiveMonth(): Promise<void> {
    try {
      const activeMonth = getActiveMonthPrefix();
      const payload = await fetchCronogramaFullData(activeMonth);
      state.cronoData = payload.operators;
      if ((payload as any).availableMonths) {
        state.availableMonths = (payload as any).availableMonths;
      }
      overtimeConfigs = payload.weekendOvertimeConfigs;

      const rotRes = await fetch(`/api/cronograma/rotation-config?month=${activeMonth}`);
      if (rotRes.ok) {
        activeRotationConfig = await rotRes.json();
      }
      
      updateDateInputDisplay();
      updateMonthDisplay();
      renderDaily();
      renderMonthly();
      if (document.getElementById('groups-view') && !document.getElementById('groups-view')!.classList.contains('hidden')) {
        renderGroupsView();
      }
    } catch (err) {
      console.error("Error reloading monthly data:", err);
      showToast("Error al recargar datos del mes", "error");
    }
  }
  ```
  Actualizar `changeMonth` para llamar a `reloadDataForActiveMonth()` en lugar de solo re-renderizar:
  ```typescript
  // Reemplazar el final de changeMonth (líneas ~416 a ~419) con:
  reloadDataForActiveMonth();
  ```
  Y en el listener de `data-month-val` (líneas ~367 a ~376):
  ```typescript
  list.querySelectorAll('[data-month-val]').forEach(item => {
    item.addEventListener('click', (e) => {
      const val = (e.currentTarget as HTMLElement).getAttribute('data-month-val');
      if (val) {
        const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
        if (dateInput) {
          dateInput.value = val;
          reloadDataForActiveMonth();
        }
      }
      (document.activeElement as HTMLElement | null)?.blur();
    });
  });
  ```

  *Modificación 4: Actualizar `renderGroupsView` para cargar la rotación por mes y actualizar el Badge en [dashboard-client.ts](file:///d:/correo-argentino-mda/src/components/cronograma/lib/dashboard-client.ts)*
  ```typescript
  async function renderGroupsView(): Promise<void> {
    try {
      const activeMonth = getActiveMonthPrefix();
      
      // Actualizar el badge de mes en la vista de grupos
      const badgeEl = document.getElementById('groups-active-month-badge');
      if (badgeEl) {
        const [y, m] = activeMonth.split('-');
        const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 15);
        const formatter = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
        badgeEl.innerText = `Mes: ${formatter.format(dateObj)}`;
      }

      const res = await fetch(`/api/cronograma/rotation-config?month=${activeMonth}`);
      if (!res.ok) throw new Error("No se pudo cargar la configuración de rotación");
      const config = await res.json();
      // ... (el resto de renderGroupsView se mantiene igual)
  ```

  *Modificación 5: Enviar el `month` en el guardado de rotación (línea ~2901):*
  ```typescript
      try {
        const activeMonth = getActiveMonthPrefix();
        const res = await fetch('/api/cronograma/rotation-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month: activeMonth, startDate, startGroup, rotationOrder })
        });
        if (!res.ok) throw new Error("Error al guardar la configuración");
        activeRotationConfig = { startDate, startGroup, rotationOrder };
        
        const data = await fetchCronogramaData(activeMonth);
        state.cronoData = data;
        
        renderMonthly();
        renderDaily();
        renderGroupsView();
        showToast("Configuración de rotación guardada con éxito", "success");
  ```

  *Modificación 6: Enviar el `month` en las llamadas a `/api/cronograma/rotation-groups/members` (líneas ~2935, ~2974, ~3065):*
  ```typescript
  // 1. En la asignación (línea ~2935):
        const activeMonth = getActiveMonthPrefix();
        const res = await fetch('/api/cronograma/rotation-groups/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: parseInt(agentIdStr, 10), saturdayGroup: g, month: activeMonth })
        });

  // 2. En la desasignación (quitar del grupo) (línea ~2974):
          const activeMonth = getActiveMonthPrefix();
          const res = await fetch('/api/cronograma/rotation-groups/members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: parseInt(agentIdStr, 10), saturdayGroup: null, month: activeMonth })
          });

  // 3. Al editar horario (línea ~3065):
      const activeMonth = getActiveMonthPrefix();
      try {
        const res = await fetch('/api/cronograma/rotation-groups/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: parseInt(agentIdStr, 10), saturdayGroup, saturdayHorario, month: activeMonth })
        });
  ```

  *Modificación 7: Listener `cronograma:month-created` (línea ~3511):*
  Recargar la data pasando el mes recién creado.
  ```typescript
  document.addEventListener('cronograma:month-created', async (e: any) => {
    const { year, month } = e.detail;
    try {
      const activeMonth = `${year}-${(month + 1).toString().padStart(2, '0')}`;
      const data = await fetchCronogramaData(activeMonth);
      state.cronoData = data;

      const dateInput = document.getElementById('date-input') as HTMLInputElement | null;
      if (dateInput) {
        dateInput.value = `${activeMonth}-01`;
        if (state.uniqueDates.length > 0) {
          dateInput.min = state.uniqueDates[0];
          dateInput.max = state.uniqueDates[state.uniqueDates.length - 1];
        }
        updateDateInputDisplay();
        updateMonthDisplay();
      }
      renderMonthDropdown();
      renderMonthly();
      showToast("Nuevo mes agregado con éxito", "success");
    } catch (err: unknown) {
      console.error("Error refreshing data after month creation:", err);
    }
  });
  ```

- [ ] **Paso 3: Realizar commit de los cambios del cliente y Astro**
  Ejecutar:
  `git add src/components/cronograma/lib/dashboard-client.ts src/components/cronograma/CronogramaDashboard.astro; git commit -m "client: synchronize groups and rotation state by active month"`

---

## Plan de Verificación y Criterios de Aceptación

### Automatizado
1. Ejecutar tests de Playwright de cronograma para corroborar estabilidad básica:
   `npx playwright test tests/cronograma.spec.ts` (si existe un test de cronograma).
2. Verificar que no haya errores de TypeScript en compilación ejecutando:
   `npm run build` o `npx tsc --noEmit`

### Manual (Criterios de Aceptación)
1. **Verificar rotación de meses independientes:**
   - Seleccionar **Junio 2026**.
   - Ir a la pestaña **Grupos**, cambiar el orden de rotación a `D,C,B,A` y presionar Guardar.
   - Cambiar a **Julio 2026** (si no existe, crearlo con "Nuevo Mes").
   - Comprobar que en Julio 2026 la configuración de rotación por defecto es la heredada de Junio (`D,C,B,A`), pero que si la cambiamos a `A,B,C,D` en Julio y guardamos, al regresar a Junio sigue figurando `D,C,B,A`.
2. **Verificar pertenencia de operadores independiente:**
   - En **Junio 2026**, asignar a "Juan Pérez" al Grupo A.
   - En **Julio 2026**, mover a "Juan Pérez" al Grupo B.
   - Regresar a **Junio 2026** y verificar que "Juan Pérez" sigue estando en el Grupo A.
   - Verificar la vista mensual para confirmar que los sábados correspondientes en Junio y Julio muestran al operador en el grupo correcto y con la modalidad respectiva según su grupo en ese mes específico.
