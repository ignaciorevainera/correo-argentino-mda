---
name: feature-structure
description: Structure new features across project layers. Use before implementing any feature that touches more than one file or layer: types first, then data functions, then UI components, then pages.
metadata:
  author: ignacio-revainera
  version: "1.0.0"
  argument-hint: <feature-to-implement>
---

## Cuando leer esta skill
Antes de implementar cualquier funcionalidad nueva que involucre mas de
un archivo o mas de una capa del proyecto.

## Que es una funcionalidad

Una funcionalidad es una unidad de trabajo que tiene sentido para el
usuario: un formulario de contacto, una lista de productos, un sistema
de login, una pagina de detalle. No es un componente aislado ni una
funcion suelta.

## Capas de una funcionalidad

Toda funcionalidad se organiza en capas bien separadas:

  Capa de tipos (src/types/)
    Define la forma de los datos que maneja la funcionalidad.
    Se crea antes que cualquier otra capa.

  Capa de datos (src/lib/)
    Funciones que acceden a la base de datos o a APIs externas.
    No saben nada de la UI.

  Capa de UI (src/components/)
    Componentes que presentan los datos y capturan interacciones.
    No saben de donde vienen los datos.

  Capa de pagina (src/pages/)
    Conecta los datos con la UI. Llama a las funciones de datos
    y pasa los resultados como props a los componentes.

## Orden de implementacion

Siempre en este orden:

1. Definir el tipo en src/types/
2. Crear la funcion de datos en src/lib/
3. Construir el componente de UI en src/components/
4. Conectar en la pagina o layout correspondiente

No al reves. Definir los datos primero evita reescribir la UI.

## Ejemplo: funcionalidad de lista de articulos

  src/types/article.ts
    export interface Article {
      id: string
      title: string
      slug: string
      excerpt: string
      publishedAt: Date
    }

  src/lib/articles.ts
    import type { Article } from '../types/article'
    export async function getArticles(): Promise<Article[]> { ... }
    export async function getArticleBySlug(slug: string): Promise<Article> { ... }

  src/components/sections/ArticleList.astro
    Recibe articles: Article[] como prop y los renderiza.
    No sabe de donde vienen los datos.

  src/pages/blog/index.astro
    Importa getArticles y ArticleList.
    Llama a getArticles en el frontmatter.
    Pasa los datos al componente como prop.

## Nombrado de archivos por capa

Tipos:      src/types/[entidad].ts           article.ts, product.ts
Datos:      src/lib/[entidad]s.ts            articles.ts, products.ts
Componente: src/components/[tipo]/[Nombre]   sections/ArticleList.astro
Pagina:     src/pages/[ruta].astro           blog/index.astro

## Cuando una funcionalidad es demasiado grande

Si una funcionalidad necesita mas de 3 funciones de datos o mas de 3
componentes, dividirla en sub-funcionalidades mas pequenas y planificar
el orden de implementacion con el agente planner antes de empezar.