---
name: content-replacement
description: Replace placeholders with real content. Use when asked to 'replace placeholders', 'add real content', or 'fill in the site content'. Follows a specific order: global texts, navigation, sections top-to-bottom, then images.
metadata:
  author: ignacio-revainera
  version: "1.0.0"
  argument-hint: <section-or-page-to-fill>
---

## Cuando leer esta skill
Antes de reemplazar placeholders por contenido real en cualquier parte
del proyecto.

## Que es un placeholder en este proyecto

Textos:
  Cualquier texto entre corchetes: [Titulo principal], [Descripcion breve]
  Cualquier texto que empiece con Lorem ipsum

Imagenes:
  Cualquier src que apunte a placehold.co

## Orden de reemplazo recomendado

1. Textos globales: nombre del proyecto, slogan, descripcion general
2. Textos de navegacion: items del navbar y footer
3. Textos de secciones: de arriba hacia abajo en cada pagina
4. Imagenes: de mayor a menor relevancia visual

## Como reemplazar textos

Reemplazar el contenido manteniendo la clase y estructura HTML intactas.
No modificar nada mas que el texto en cada paso.

  Antes:
    <h1 class="text-4xl font-bold">[Titulo principal del hero]</h1>

  Despues:
    <h1 class="text-4xl font-bold">Nombre real del proyecto</h1>

## Como reemplazar imagenes

Al reemplazar una imagen de placehold.co por una imagen real:

  1. Colocar la imagen en src/assets/ o public/ segun corresponda
  2. Si va en src/assets/, importarla en el frontmatter
  3. Usar el componente Image de Astro
  4. Mantener las mismas dimensiones aproximadas del placeholder
  5. Actualizar el alt con una descripcion real del contenido de la imagen

  Antes:
    <Image src="https://placehold.co/800x450" alt="[Captura de pantalla del producto]" width={800} height={450} />

  Despues:
    ---
    import productoImg from '../assets/producto-dashboard.png'
    ---
    <Image src={productoImg} alt="Vista del dashboard principal de la aplicacion" />

## Verificacion despues de cada reemplazo

Despues de reemplazar el contenido de una seccion o pagina, verificar:

  - El texto tiene sentido en el contexto visual donde aparece
  - La imagen tiene las proporciones correctas y no se ve distorsionada
  - El alt de la imagen describe el contenido real
  - El layout no se rompio por diferencias de longitud en el texto
  - Abrir en el navegador para verificar visualmente

## Actualizar DESIGN_SYSTEM.md

Cuando se reemplazan todos los placeholders de una seccion, actualizar
la lista de pendientes en DESIGN_SYSTEM.md marcando lo que ya tiene
contenido real.