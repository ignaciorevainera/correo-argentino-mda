# Tareas

Este archivo es el plan de trabajo activo del proyecto.
El agente planner lo escribe antes de cada implementacion.
El agente qa-reviewer lo limpia al cerrar cada tarea.
Se lee al inicio de cada sesion para saber donde retomar.

## Estado actual

Sin tareas activas. El agente planner escribe aqui antes de
cada implementacion siguiendo este formato:

---

# Tarea: [nombre descriptivo de la tarea]
Fecha: [fecha]

## Descripcion
[Que hay que hacer y por que]

## Riesgos identificados
- [riesgo 1]
- [riesgo 2]

## Plan de ejecucion

[ ] Paso 1 — [agente]: [descripcion del paso]
    Criterio de exito: [como se verifica que este paso esta completo]

[ ] Paso 2 — [agente]: [descripcion del paso]
    Criterio de exito: [como se verifica que este paso esta completo]

[ ] Paso N — qa-reviewer: verificar resultado y hacer commit
    Criterio de exito: build sin errores y checklist aprobado

## Agentes involucrados
- [lista de agentes que participan en esta tarea]

## Criterio de exito global
[Como se demuestra que la tarea completa esta terminada]

---

> Este archivo se reemplaza completamente al iniciar cada tarea nueva.
> El historial de tareas completadas vive en git — no se acumula aqui.