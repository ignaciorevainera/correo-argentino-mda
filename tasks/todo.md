# Tarea: Agregar enlace Nucleus (R.R.H.H.) a Enlaces Importantes

Fecha: 2026-05-08

## Descripcion

Agregar el acceso a la plataforma de R.R.H.H. "Nucleus" al archivo de datos de enlaces importantes, asegurando que se integre en la categoria correspondiente y mantenga la estructura de datos definida.

## Definicion de cambio propuesto

- **Titulo:** Nucleus (R.R.H.H.)
- **URL:** https://corasa.nucleusrh.com.ar/LOGIN/
- **Categoria sugerida:** Plataformas internas (id: plataformas-internas)
- **ID del enlace:** nucleus-rrhh
- **Subtitle:** Plataforma de R.R.H.H.

## Plan de ejecucion

[x] Paso 1 — fullstack: actualizar `src/data/enlaces_importantes.json` con el nuevo enlace en la categoria "Plataformas internas".
[x] Paso 2 — qa-reviewer: validar que el JSON sea valido y que el enlace aparezca correctamente en la vista de /enlaces-importantes.

## Agentes involucrados

- fullstack
- qa-reviewer

## Criterio de exito global

El enlace "Nucleus (R.R.H.H.)" es visible y funcional en la seccion de "Plataformas internas" dentro de la pagina de Enlaces Importantes, siguiendo el formato de los demas items.
