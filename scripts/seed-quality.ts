import { db } from "../src/db/index";
import { agents, qualityAudits, auditParameters, auditScores, monthlySummaries } from "../src/db/schema";

async function seedQuality() {
  console.log("🚀 Iniciando inserción de auditorías de calidad de prueba con parámetros dinámicos...");

  try {
    // 1. Obtener todos los agentes
    const dbAgents = await db.select().from(agents);
    if (dbAgents.length === 0) {
      console.log("⚠️ No se encontraron agentes en la tabla 'agents'. Ejecuta primero seed-agents.");
      return;
    }

    console.log(`Encontrados ${dbAgents.length} agentes. Limpiando datos previos de calidad...`);
    await db.delete(auditScores);
    await db.delete(qualityAudits);
    await db.delete(auditParameters);
    await db.delete(monthlySummaries);

    // 2. Inicializar parámetros dinámicos estándar
    console.log("Insertando parámetros de auditoría estándar...");
    const defaultParams = [
      // Sección 1: Interacción con Usuario
      { code: "cordialidad", name: "Cordialidad y cortesía", weight: 1.0, category: "Interacción con Usuario" },
      { code: "saludo", name: "Uso del saludo estándar", weight: 1.0, category: "Interacción con Usuario" },
      { code: "interes", name: "Demuestra interés en resolver", weight: 1.0, category: "Interacción con Usuario" },
      { code: "sondeo", name: "Sondeo adecuado", weight: 1.0, category: "Interacción con Usuario" },
      { code: "escucha", name: "Escucha activa y atenta", weight: 1.0, category: "Interacción con Usuario" },
      { code: "control", name: "Control de la conversación", weight: 1.0, category: "Interacción con Usuario" },
      { code: "contencion", name: "Contención en la espera", weight: 1.0, category: "Interacción con Usuario" },
      { code: "despedida", name: "Se despide cordialmente", weight: 1.0, category: "Interacción con Usuario" },
      { code: "solicitud", name: "Solicitud de conformidad", weight: 1.0, category: "Interacción con Usuario" },
      { code: "lenguaje", name: "Lenguaje apropiado", weight: 1.0, category: "Interacción con Usuario" },
      
      // Sección 2: Gestión del Ticket
      { code: "origen", name: "Origen de la solicitud", weight: 1.0, category: "Gestión del Ticket" },
      { code: "tipo", name: "Tipo de solicitud", weight: 1.0, category: "Gestión del Ticket" },
      { code: "categorizacion", name: "Categorización correcta", weight: 1.0, category: "Gestión del Ticket" },
      { code: "ortografia", name: "Buena ortografía", weight: 1.0, category: "Gestión del Ticket" },
      { code: "prioridad", name: "Prioridad correcta", weight: 1.0, category: "Gestión del Ticket" },
      { code: "titulo", name: "Título descriptivo", weight: 1.0, category: "Gestión del Ticket" },
      { code: "cierre", name: "Criterio de cierre", weight: 1.0, category: "Gestión del Ticket" },
      { code: "descripcion", name: "Descripción y evidencia", weight: 1.0, category: "Gestión del Ticket" },
      { code: "exactitud", name: "Exactitud en ingreso", weight: 1.0, category: "Gestión del Ticket" }
    ];

    const insertedParams = await db.insert(auditParameters).values(defaultParams).returning();
    
    // Crear mapeo de código de parámetro a id
    const paramMap: Record<string, number> = {};
    for (const p of insertedParams) {
      paramMap[p.code] = p.id;
    }

    const months = ["05-2026", "04-2026", "03-2026", "02-2026", "01-2026", "12-2025"];
    let auditCount = 0;
    let scoresCount = 0;

    for (const agent of dbAgents) {
      // Para cada agente, generamos auditorías para los últimos 6 meses
      for (const month of months) {
        const numAudits = month === "05-2026" ? 4 : Math.floor(Math.random() * 2) + 1;

        for (let i = 0; i < numAudits; i++) {
          const s1Items = Array.from({ length: 10 }, (_, idx) => {
            const probabilities = [0.9, 0.9, 0.85, 0.85, 0.9, 0.85, 0.8, 0.9, 0.85, 0.95];
            return Math.random() > (1 - probabilities[idx]);
          });
          const s1Checked = s1Items.filter(Boolean).length;

          const s2Items = Array.from({ length: 9 }, (_, idx) => {
            const probabilities = [0.9, 0.9, 0.85, 0.85, 0.9, 0.9, 0.8, 0.9, 0.85];
            return Math.random() > (1 - probabilities[idx]);
          });
          const s2Checked = s2Items.filter(Boolean).length;

          const section1Score = Math.round((s1Checked / 10) * 100);
          const section2Score = Math.round((s2Checked / 9) * 100);
          const totalScore = Math.round((section1Score + section2Score) / 2);

          const callId = `CALL-${Math.floor(100000 + Math.random() * 900000)}`;
          const ticketId = `INC-${Math.floor(1000000 + Math.random() * 9000000)}`;
          const duration = `${Math.floor(2 + Math.random() * 8)}:${Math.floor(10 + Math.random() * 50)}`;
          
          const day = String(Math.floor(1 + Math.random() * 28)).padStart(2, '0');
          const [m, y] = month.split("-");
          const date = `${y}-${m}-${day}`;

          const isCriticalFailure = Math.random() > 0.95;
          const notes = Math.random() > 0.5 ? `Operador demostró buen trato. Se observa oportunidad de mejora en tiempos.` : null;

          if (i === 0) {
            const summary = `Desempeño mensual de ${agent.name} estable y dentro de los objetivos de calidad.`;
            await db.insert(monthlySummaries).values({
              agentId: agent.id,
              month,
              summary
            }).onConflictDoUpdate({
              target: [monthlySummaries.agentId, monthlySummaries.month],
              set: { summary }
            });
          }

          // Insertar auditoría principal
          const [insertedAudit] = await db.insert(qualityAudits).values({
            agentId: agent.id,
            callId,
            ticketId,
            duration,
            date,
            month,
            totalScore,
            section1Score,
            section2Score,
            isCriticalFailure,
            notes,
          }).returning({ id: qualityAudits.id });

          // Preparar e insertar scores individuales
          const auditScoresToInsert = [];
          
          // Sección 1
          for (let idx = 0; idx < 10; idx++) {
            const code = defaultParams[idx].code;
            auditScoresToInsert.push({
              auditId: insertedAudit.id,
              parameterId: paramMap[code],
              score: s1Items[idx]
            });
            scoresCount++;
          }

          // Sección 2
          for (let idx = 0; idx < 9; idx++) {
            const code = defaultParams[idx + 10].code;
            auditScoresToInsert.push({
              auditId: insertedAudit.id,
              parameterId: paramMap[code],
              score: s2Items[idx]
            });
            scoresCount++;
          }

          await db.insert(auditScores).values(auditScoresToInsert);
          auditCount++;
        }
      }
    }

    console.log(`✅ Se insertaron exitosamente ${auditCount} auditorías de calidad y ${scoresCount} puntuaciones.`);

  } catch (error) {
    console.error("❌ Error al insertar auditorías de calidad:", error);
  }
}

seedQuality();
