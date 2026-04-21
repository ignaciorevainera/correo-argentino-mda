---
name: components
description: Apply Astro component conventions. Use when creating or modifying any component, to determine correct folder placement, structure, naming, props typing, slots usage, and DaisyUI-first approach.
metadata:
  author: ignacio-revainera
  version: "1.0.0"
  argument-hint: <component-name-or-task>
---

## Cuando leer esta skill
Antes de crear o modificar cualquier componente de Astro.

## Tipos de componentes y donde van

src/components/ui/
  Componentes atomicos y reutilizables. No tienen conocimiento del
  dominio del proyecto. Funcionan con cualquier contenido que se les pase.
  Ejemplos: Button, Card, Badge, Avatar, SectionWrapper, Divider

src/components/sections/
  Secciones completas de pagina. Pueden tener contenido hardcodeado si es
  estatico o recibir props si es variable. No hacen fetch de datos.
  Ejemplos: Hero, Features, Testimonials, CTA, Pricing, FAQ

src/components/global/
  Elementos presentes en todas o casi todas las paginas.
  Ejemplos: Navbar, Footer, MobileMenu, ThemeToggle

## Estructura de un componente

Todo componente sigue esta estructura en el frontmatter:

  ---
  interface Props {
    // todas las props tipadas
    // props opcionales con valor por defecto
  }
  const { prop1, prop2 = 'valorPorDefecto' } = Astro.props
  ---

  <!-- template con clases de Tailwind y DaisyUI unicamente -->

## Nomenclatura

Archivos: PascalCase con extension .astro
  HeroSection.astro, ContactForm.astro, PricingCard.astro

Props: camelCase
  imageUrl, isActive, buttonLabel, cardVariant

Variantes como union types cuando el componente tiene variaciones visuales:
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'

## Responsabilidad unica

Cada componente hace una sola cosa. Si un componente supera las 150 lineas
es una señal de que debe dividirse en sub-componentes.

Correcto:
  HeroSection.astro — la seccion hero completa
  HeroCTA.astro — solo el bloque de call to action del hero

Incorrecto:
  HeroSection.astro de 300 lineas con navbar, hero y primera seccion mezclados

## Componentes DaisyUI primero

Antes de construir cualquier componente custom, verificar si DaisyUI ya
tiene uno que cubra la necesidad. Usar el componente nativo y extenderlo
con clases de Tailwind si hace falta.

## Slots

Usar slots de Astro para contenido dinamico que no es un dato simple:

  <!-- en el componente -->
  <div class="card">
    <div class="card-body">
      <slot name="header" />
      <slot /> <!-- slot por defecto -->
      <slot name="footer" />
    </div>
  </div>

  <!-- en el uso -->
  <Card>
    <h2 slot="header">Titulo</h2>
    <p>Contenido principal</p>
  </Card>

## Documentacion del componente

Agregar un comentario al inicio del componente si tiene props no evidentes:

  ---
  /**
   * Card reutilizable para mostrar contenido destacado.
   * variant 'featured' agrega borde de color primario.
   */
  interface Props {
    title: string
    variant?: 'default' | 'featured'
  }
  ---