# ADR 0006 — IA y tratamiento de datos

- **Estado:** Pendiente de Seguridad/Legal
- **Fecha:** 2026-10-23
- **Decisores:** Seguridad, Legal, Negocio, Arquitectura

## Contexto

El módulo de calidad usa IA para evaluar auditorías:

- Groq Whisper para transcribir audio.
- OpenCode CLI con modelos en la nube.
- Un “council” de múltiples modelos.
- Scraping de InvGate para obtener la línea de tiempo.

Esto implica enviar audio, transcripciones y datos de tickets a proveedores externos. No hay evidencia en el repositorio de una aprobación formal de Seguridad ni de un análisis de clasificación de datos.

## Decisión pendiente

Definir:

1. Si se permite IA generativa.
2. Qué datos pueden salir de la red corporativa.
3. Qué proveedores están aprobados.
4. Si se requiere on-premise.
5. Retención y borrado en proveedores.
6. Registro de consentimiento.
7. Cómo se audita el uso.

## Opciones

| Opción | Descripción | Riesgo |
|---|---|---|
| A. Sin IA | Se elimina la evaluación automática | Pérdida de funcionalidad |
| B. IA en nube aprobada | Groq/OpenCode con datos anonimizados | Depende de contrato |
| C. IA on-premise | Modelo local | Costo de infraestructura |
| D. IA solo asistiva | Sugerencias, decisión humana | Menor riesgo |

## Recomendación

- Implementar **feature flag** `AI_ENABLED`.
- Empezar con opción D (asistiva) si Seguridad no aprueba B.
- Anonimizar audio/transcripción cuando sea posible.
- No enviar PII de clientes.
- Registrar cada evaluación y su proveedor.
- Bloquear el módulo si el flag está apagado, sin romper el resto.

## Consecuencias de no decidir

- El módulo de calidad no se puede migrar completo.
- Riesgo legal/seguridad si se usa sin aprobación.
- Retrabajo si se elige un proveedor y luego se prohíbe.

## Referencias

- `docs/architecture/03-deuda-tecnica.md` (S-07, S-08)
- `docs/architecture/04-arquitectura-objetivo.md`
