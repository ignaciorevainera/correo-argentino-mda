---
description: Apply git commit conventions and safety rules. Loaded automatically when making commits, managing branches, staging changes, or any version control task.
applyTo: '**/.gitignore, **/*.md'
---

## Alcance

Estas instrucciones aplican a cualquier tarea que involucre:
- Commits durante el desarrollo
- Gestion de ramas
- Verificacion de cambios antes de hacer commit

## Convencion de commits

Usar conventional commits en todos los proyectos:

  tipo(alcance): descripcion breve en minusculas

Tipos permitidos:
  feat      — nueva funcionalidad
  fix       — correccion de error
  style     — cambios de estilos o UI sin logica
  refactor  — refactorizacion sin cambio de comportamiento
  chore     — tareas de mantenimiento, dependencias, configuracion
  docs      — cambios en documentacion
  test      — agregado o modificacion de tests
  perf      — mejoras de performance
  build     — sistema de build o dependencias
  ci        — cambios de configuracion de CI
  revert    — reversion de un commit anterior

Los commits se escriben siempre en ingles, sin excepcion.
No importa el idioma del proyecto, del equipo ni del cliente.

Ejemplos correctos:
  feat(auth): add login form with supabase
  fix(navbar): fix mobile menu at sm breakpoint
  style(hero): adjust hero section spacing on mobile
  refactor(card): extract reusable CardHeader component
  chore: update astro dependencies to version 5

Breaking changes:
  feat!: remove deprecated endpoint
  Or with footer: BREAKING CHANGE: description of the change

## Flujo de commit

### 1. Analizar el diff antes de commitear

  git diff --staged   — si ya hay archivos en staging
  git diff            — si no hay nada en staging
  git status --porcelain

Determinar a partir del diff:
  - Tipo: que clase de cambio es
  - Alcance: que area o modulo se ve afectado
  - Descripcion: resumen en una linea, tiempo presente, modo imperativo

### 2. Staging inteligente

Agrupar en el mismo commit solo los cambios que pertenecen a la misma
unidad logica. Si el diff mezcla cambios de distinta naturaleza, stagear
por archivo o patron:

  git add src/components/feature/  — cambios de una funcionalidad
  git add src/lib/queries.ts        — cambios de datos relacionados

Nunca commitear: archivos .env, credenciales, claves privadas.

### 3. Ejecutar el commit

Descripcion en una linea (menos de 72 caracteres):
  git commit -m "tipo(alcance): descripcion"

Con cuerpo cuando el cambio necesita contexto adicional:
  git commit -m "tipo(alcance): descripcion

  Explicacion de por que se hizo el cambio si no es evidente
  a partir del codigo.

  Closes #123"

## Frecuencia de commits

Hacer commit despues de cada unidad logica de trabajo completada,
no al final del dia ni al final de la tarea completa.

Una unidad logica es:
  - Un componente nuevo funcionando
  - Una query nueva con su tipado
  - Una seccion de pagina completa
  - Una correccion de bug verificada

## Antes de hacer commit

Verificar siempre:
  - El build no tiene errores: npm run build
  - No hay archivos de debug o console.log innecesarios
  - Los archivos de contexto estan actualizados si hubo cambios relevantes

## Ramas

Estructura de ramas recomendada:
  main          — produccion, siempre estable
  dev           — desarrollo activo
  feat/nombre   — funcionalidades nuevas
  fix/nombre    — correcciones puntuales

Nunca hacer commits directamente en main salvo proyectos personales
simples donde una sola rama es suficiente.

## Protocolo de seguridad de git

- Nunca modificar la configuracion global de git
- Nunca ejecutar comandos destructivos (--force, hard reset) sin
  pedido explicito del usuario
- Nunca saltear hooks con --no-verify salvo que el usuario lo pida
- Nunca hacer force push a main o master
- Si un commit falla por un hook, corregir el problema y crear
  un commit nuevo, nunca usar --amend para eludir el error

## Instalacion de dependencias

La instalacion de dependencias npm es responsabilidad del usuario,
no del agente. El agente nunca ejecuta npm install, npm add ni
variantes equivalentes.

El agente puede indicar que dependencias son necesarias para una
tarea, pero el usuario decide cuando y como instalarlas.

Una vez que el usuario confirma que la dependencia esta instalada,
el agente procede a usarla con normalidad.